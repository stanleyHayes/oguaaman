package http

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── paid advertising: serving, the ad library and the report ────────────────
// (spec §3.9, §3.10, §4.4 and GET /api/admin/ads/report of §4.6)
//
// The public routes never read the caller's session: what a reader sees is
// the same for everyone, and a beacon or click says nothing about who sent
// it beyond a salted, day-long hash used for rate limits.

// AdServingDeps are the serving-side ads services. Any of them may be nil:
// the slate is then empty, beacons are dropped, clicks 404, the library is
// empty and the report answers 503.
type AdServingDeps struct {
	Serving *service.AdServingService
	Library *service.AdLibraryService
	Report  *service.AdReportService
}

// WithAdServing attaches the serving-side ads services.
func (h *Handler) WithAdServing(d AdServingDeps) *Handler {
	h.adServing = d
	return h
}

// RegisterAdServingRoutes adds the slate, beacon, click, library and report
// routes to mux.
func (h *Handler) RegisterAdServingRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ads/slate", h.AdSlate)
	mux.HandleFunc("POST /api/ads/v", h.AdViewBeacon)
	mux.HandleFunc("GET /api/ads/c/{id}", h.AdClick)
	mux.HandleFunc("GET /api/ads/library", h.AdLibrary)
	mux.HandleFunc("GET /api/admin/ads/report", h.AdminAdReport)
}

// Flood limits on the public ads routes, per network (clientNet: the IPv4
// address or the IPv6 /64), checked before any other work. The caller
// writes its own user agent, so these never key on it: a key it can vary at
// will is no limit, and every invented key would cost memory. Many readers
// share one address in Ghana (carrier NAT, campus and office Wi-Fi), so the
// numbers are far above what people produce and only stop scripts:
//   - a slate per ad slot per page view, a few slots a page: 1,200 a minute
//     is twenty a second from one address;
//   - one beacon per ad actually seen: the same 1,200;
//   - clicks are rare (well under one per hundred views): 60 a minute;
//   - the ad library is browsed by people, a page at a time: 120 a minute.
//
// Billing and counting have their own, much tighter, per-network caps in
// the serving service; these only bound the work a flood can cause.
const (
	adSlatesPerNetworkMinute  = 1200
	adBeaconsPerNetworkMinute = 1200
	adClicksPerNetworkMinute  = 60
	adLibraryPerNetworkMinute = 120

	adBeaconMaxBytes    = 1024
	adLibraryCache      = "public, max-age=60"
	headerCacheControl  = "Cache-Control"
	headerRetryAfter    = "Retry-After"
	cacheNoStore        = "no-store"
	msgAdClickNotFound  = "This ad is no longer available.\n"
	msgAdClickFailed    = "We couldn't open this ad. Try again in a moment.\n"
	contentTypePlainTxt = "text/plain; charset=utf-8"
)

// adVisitor describes the caller for bot filtering and rate limits only. It
// deliberately ignores Authorization and cookies.
func adVisitor(r *http.Request) service.AdVisitor {
	return service.AdVisitor{
		ClientKey: clientIP(r),
		UserAgent: r.UserAgent(),
		Prefetch:  service.IsAdPrefetch(r.Header.Get("Sec-Purpose"), r.Header.Get("Purpose")),
	}
}

// AdSlate — GET /api/ads/slate?placement=&section=&political=0|1&surface=
// (public, no-store). Section and surface are accepted for the record; the
// placement alone decides what can show.
func (h *Handler) AdSlate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set(headerCacheControl, cacheNoStore)
	if h.rateLimited(w, r, "adslate:"+clientNet(r), adSlatesPerNetworkMinute, time.Minute) {
		return
	}
	q := r.URL.Query()
	placement := q.Get("placement")
	svc := h.adServing.Serving
	if svc == nil {
		p, ok := domain.AdPlacementBySlug(placement)
		if !ok {
			writeCodeError(w, http.StatusBadRequest, service.AdErrInvalidPlacement, "Choose one of the listed placements.", "placement")
			return
		}
		writeJSON(w, http.StatusOK, service.AdSlate{Placement: p.Slug, Why: p.Why, Ads: []service.AdSlateItem{}})
		return
	}
	slate, err := svc.Slate(r.Context(), placement, q.Get("political") == "1", adVisitor(r), h.publicURL(r, ""))
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, slate)
}

// AdViewBeacon — POST /api/ads/v (public). The body is text/plain JSON
// {c,p,v,t,e} of at most 1 KB. The answer is always 204, billed or not,
// flooding or not: a beacon over the network limit is dropped unread.
func (h *Handler) AdViewBeacon(w http.ResponseWriter, r *http.Request) {
	defer w.WriteHeader(http.StatusNoContent)
	w.Header().Set(headerCacheControl, cacheNoStore)
	svc := h.adServing.Serving
	if svc == nil || !h.limiter.allow("adbeacon:"+clientNet(r), adBeaconsPerNetworkMinute, time.Minute) {
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, adBeaconMaxBytes+1))
	if err != nil || len(raw) > adBeaconMaxBytes {
		return
	}
	var b service.AdBeacon
	if json.Unmarshal(raw, &b) != nil {
		return
	}
	svc.RecordView(r.Context(), b, adVisitor(r))
}

// AdClick — GET /api/ads/c/{id}?p=&t=&e= (public). It always redirects to
// the landing page stored with the campaign, counting the click only when
// its token is good; an unknown campaign is a plain-text 404.
func (h *Handler) AdClick(w http.ResponseWriter, r *http.Request) {
	w.Header().Set(headerCacheControl, cacheNoStore)
	if !h.limiter.allow("adclick:"+clientNet(r), adClicksPerNetworkMinute, time.Minute) {
		w.Header().Set(headerRetryAfter, "60")
		writePlain(w, http.StatusTooManyRequests, msgRateLimited+"\n")
		return
	}
	svc := h.adServing.Serving
	if svc == nil {
		writePlain(w, http.StatusNotFound, msgAdClickNotFound)
		return
	}
	q := r.URL.Query()
	exp, _ := strconv.ParseInt(q.Get("e"), 10, 64)
	landing, _, err := svc.Click(r.Context(), service.AdClick{
		CampaignID: r.PathValue("id"), Placement: q.Get("p"), Token: q.Get("t"), Exp: exp,
	}, adVisitor(r))
	switch {
	case errors.Is(err, service.ErrAdNotFound):
		writePlain(w, http.StatusNotFound, msgAdClickNotFound)
		return
	case err != nil:
		h.log.Error("ads: click lookup failed", "err", err)
		writePlain(w, http.StatusInternalServerError, msgAdClickFailed)
		return
	}
	w.Header().Set("Referrer-Policy", "origin")
	w.Header().Set("Location", landing)
	w.WriteHeader(http.StatusFound)
}

// writePlain answers with a short plain-text body.
func writePlain(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", contentTypePlainTxt)
	w.WriteHeader(status)
	_, _ = io.WriteString(w, msg)
}

// AdLibrary — GET /api/ads/library?tab=political|running&q=&page= (public).
func (h *Handler) AdLibrary(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "adlibrary:"+clientNet(r), adLibraryPerNetworkMinute, time.Minute) {
		return
	}
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	query := service.AdLibraryQuery{Tab: q.Get("tab"), Q: q.Get("q"), Page: page}
	svc := h.adServing.Library
	if svc == nil {
		writeJSON(w, http.StatusOK, service.AdLibraryPage{Items: []service.AdLibraryItem{}, Page: max(page, 1), PerPage: service.AdLibraryPerPage})
		return
	}
	out, err := svc.Library(r.Context(), query)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	w.Header().Set(headerCacheControl, adLibraryCache)
	writeJSON(w, http.StatusOK, out)
}

// AdminAdReport — GET /api/admin/ads/report?from=&to= (curator).
func (h *Handler) AdminAdReport(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	svc := h.adServing.Report
	if svc == nil {
		writeCodeError(w, http.StatusServiceUnavailable, codeUnavailable, msgUnavailable, "")
		return
	}
	q := r.URL.Query()
	out, err := svc.Report(r.Context(), q.Get("from"), q.Get("to"))
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
