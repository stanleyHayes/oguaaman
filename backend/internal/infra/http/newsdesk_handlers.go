package http

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/ogcard"
	"github.com/oguaa/backend/internal/service"
)

// ── the researched news desk (spec §2, §4.1) ─────────────────────────────────

// NewsDeskDeps wires the researched news desk.
type NewsDeskDeps struct {
	Desk *service.NewsDesk
}

// WithNewsDesk attaches the news desk.
func (h *Handler) WithNewsDesk(d NewsDeskDeps) *Handler {
	h.newsDesk = d.Desk
	return h
}

// RegisterNewsDeskRoutes adds the branded cover, research-queue, editor and
// news-desk settings routes (spec §4.1) to mux. NewRouter calls it.
func (h *Handler) RegisterNewsDeskRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/news/{slug}/cover.png", h.NewsCover)
	mux.HandleFunc("GET /api/admin/news/research", h.AdminResearchJobs)
	mux.HandleFunc("GET /api/admin/news/{id}/research", h.AdminResearchJob)
	mux.HandleFunc("POST /api/admin/news/{id}/research/approve", h.AdminResearchApprove)
	mux.HandleFunc("POST /api/admin/news/{id}/research/reject", h.AdminResearchReject)
	mux.HandleFunc("POST /api/admin/news/{id}/research/rerun", h.AdminResearchRerun)
	mux.HandleFunc("POST /api/admin/news/{id}/research/cover", h.AdminResearchCover)
	mux.HandleFunc("POST /api/admin/news/{id}/corrections", h.AdminNewsCorrection)
	mux.HandleFunc("GET /api/admin/settings/news-desk", h.AdminNewsDeskSettings)
	mux.HandleFunc("PUT /api/admin/settings/news-desk", h.AdminSaveNewsDeskSettings)
}

const (
	newsCoverPerMinute   = 60
	newsCoverCache       = "public, max-age=86400"
	newsCoverKicker      = "OGUAA NEWSROOM"
	newsCoverSourceIfNil = "Oguaa"
	newsCoverRetryAfter  = "2" // seconds; two render slots clear a burst quickly
	codeNewsCoverBusy    = "cover_busy"
	msgNewsCoverBusy     = "This cover is still being drawn. Try again in a moment."

	codeJobNotReady        = "job_not_ready"
	codeJobNotRerunnable   = "job_not_rerunnable"
	codeDeskDisabled       = "desk_disabled"
	codeImageCapReached    = "image_cap_reached"
	codeImagesUnavailable  = "images_unavailable"
	codeTopicBlocked       = "topic_blocked"
	codeElectionMode       = "election_mode"
	msgJobNotReady         = "This draft isn't waiting for review any more. Reload to see its status."
	msgJobNotRerunnable    = "This research job can't be run again."
	msgDeskDisabled        = "Long-form research is switched off. Turn on the desk and long-form reports first."
	msgImageCapReached     = "Today's image allowance is used up. Try again tomorrow or use the branded cover."
	msgImagesUnavailable   = "AI illustrations aren't available on this server. Use the branded cover."
	msgTopicBlocked        = "This story touches a topic AI never drafts, such as courts, crime, accidents, children or a blocked keyword. It stays a brief."
	msgElectionMode        = "Election mode is on, so AI-assisted political reports can't be researched or published. The brief stays as it is until election mode ends."
	msgArticleNotFound     = "We couldn't find that article."
	msgResearchJobNotFound = "There is no research job for this article."
)

// newsDeskErrs maps the desk's sentinels onto status, code and message.
var newsDeskErrs = []struct {
	err           error
	status        int
	code, message string
}{
	{service.ErrJobNotReady, http.StatusConflict, codeJobNotReady, msgJobNotReady},
	{service.ErrJobNotRerunnable, http.StatusConflict, codeJobNotRerunnable, msgJobNotRerunnable},
	{service.ErrDeskDisabled, http.StatusConflict, codeDeskDisabled, msgDeskDisabled},
	{service.ErrImageCapReached, http.StatusTooManyRequests, codeImageCapReached, msgImageCapReached},
	{service.ErrImagesUnavailable, http.StatusServiceUnavailable, codeImagesUnavailable, msgImagesUnavailable},
	{service.ErrTopicBlocked, http.StatusConflict, codeTopicBlocked, msgTopicBlocked},
	{service.ErrElectionMode, http.StatusConflict, codeElectionMode, msgElectionMode},
}

// writeNewsDeskErr writes the coded error for a news-desk failure.
func (h *Handler) writeNewsDeskErr(w http.ResponseWriter, err error) {
	for _, m := range newsDeskErrs {
		if errors.Is(err, m.err) {
			writeCodeError(w, m.status, m.code, m.message, "")
			return
		}
	}
	h.writeSettingsErr(w, err)
}

// deskFor returns the desk for a staff route that passed its role check, or
// answers 503 when it is not wired.
func (h *Handler) deskFor(w http.ResponseWriter) *service.NewsDesk {
	if h.newsDesk == nil {
		writeCodeError(w, http.StatusServiceUnavailable, codeUnavailable, msgUnavailable, "")
	}
	return h.newsDesk
}

// publicNews applies the public serialisation rule to one article.
func (h *Handler) publicNews(r *http.Request, a domain.NewsArticle) domain.NewsArticle {
	return service.WithBrandedCover(a, h.publicURL(r, ""))
}

// NewsCover renders a published article's branded cover.
// GET /api/news/{slug}/cover.png (public, 60 per minute).
func (h *Handler) NewsCover(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "newscover:"+clientKey(r), newsCoverPerMinute, time.Minute) {
		return
	}
	a, err := h.svc.NewsBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			writeCodeError(w, http.StatusNotFound, codeNotFound, msgArticleNotFound, "")
			return
		}
		h.handleErr(w, err)
		return
	}
	source := a.SourceName
	if source == "" {
		source = newsCoverSourceIfNil
	}
	date := service.CoverDate(a.PublishedAt)
	if date == "" {
		date = service.CoverDate(a.CreatedAt)
	}
	png, err := h.coverRenderer().png(ogcard.NewsCover{Seed: a.Slug, Kicker: newsCoverKicker, Title: a.Title, Source: source, Date: date})
	if errors.Is(err, errNewsCoverBusy) {
		w.Header().Set(headerCacheControl, cacheNoStore)
		w.Header().Set(headerRetryAfter, newsCoverRetryAfter)
		writeCodeError(w, http.StatusServiceUnavailable, codeNewsCoverBusy, msgNewsCoverBusy, "")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set(headerCacheControl, newsCoverCache)
	_, _ = w.Write(png)
}

// AdminResearchJobs lists the research queue.
// GET /api/admin/news/research?status=ready&page=1 (editor).
func (h *Handler) AdminResearchJobs(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if h.newsDesk == nil {
		writeJSON(w, http.StatusOK, service.NewsJobPage{Items: []domain.NewsResearchJob{}, Page: max(page, 1), PerPage: 20})
		return
	}
	out, err := h.newsDesk.Jobs(r.Context(), r.URL.Query().Get("status"), page)
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminResearchJob returns an article's research job with its draft.
// GET /api/admin/news/{id}/research (editor). 404 when there is none.
func (h *Handler) AdminResearchJob(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	if h.newsDesk == nil {
		writeCodeError(w, http.StatusNotFound, codeNotFound, msgResearchJobNotFound, "")
		return
	}
	job, err := h.newsDesk.JobForArticle(r.Context(), r.PathValue("id"))
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			writeCodeError(w, http.StatusNotFound, codeNotFound, msgResearchJobNotFound, "")
			return
		}
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// AdminResearchApprove publishes a ready draft over its brief.
// POST /api/admin/news/{id}/research/approve (editor).
func (h *Handler) AdminResearchApprove(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	var in service.NewsApproveInput
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	a, err := desk.Approve(r.Context(), r.PathValue("id"), in, auditActor(r))
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// AdminResearchReject turns a ready draft down.
// POST /api/admin/news/{id}/research/reject {"reason"} (editor).
func (h *Handler) AdminResearchReject(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	job, err := desk.Reject(r.Context(), r.PathValue("id"), in.Reason, auditActor(r))
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// AdminResearchRerun queues a finished job again.
// POST /api/admin/news/{id}/research/rerun (editor). 202 with the job.
func (h *Handler) AdminResearchRerun(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	job, err := desk.Rerun(r.Context(), r.PathValue("id"))
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusAccepted, job)
}

// AdminResearchCover regenerates a draft's illustration or makes it branded.
// POST /api/admin/news/{id}/research/cover {"action"} (editor).
func (h *Handler) AdminResearchCover(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	var in struct {
		Action string `json:"action"`
	}
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	job, err := desk.Cover(r.Context(), r.PathValue("id"), in.Action)
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// AdminNewsCorrection appends a dated public correction.
// POST /api/admin/news/{id}/corrections {"note"} (editor).
func (h *Handler) AdminNewsCorrection(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	a, err := desk.AddCorrection(r.Context(), r.PathValue("id"), in.Note)
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// AdminNewsDeskSettings returns the newsroom settings with the election-mode
// and key indicators. GET /api/admin/settings/news-desk (editor).
func (h *Handler) AdminNewsDeskSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleEditor); !ok {
		return
	}
	writeJSON(w, http.StatusOK, h.newsDesk.SettingsView(r.Context()))
}

// AdminSaveNewsDeskSettings saves the newsroom settings.
// PUT /api/admin/settings/news-desk (steward). Body: the settings with
// "version" and a "reason".
func (h *Handler) AdminSaveNewsDeskSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleSteward); !ok {
		return
	}
	desk := h.deskFor(w)
	if desk == nil {
		return
	}
	var in service.NewsDeskSettingsInput
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	out, err := desk.SaveSettings(r.Context(), in, auditActor(r))
	if err != nil {
		h.writeNewsDeskErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}
