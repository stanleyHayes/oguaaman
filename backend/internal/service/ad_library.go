package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: the public ad library (spec §3.10, §4.4) ──────────────
//
// Two tabs. "Political ads" lists every political campaign that was ever
// booked (scheduled or later, removed ones included, with the reason) until
// its retainUntil, seven years on. "Running now" lists every active ad. Each
// entry shows the creative as readers saw it, who paid, what they paid and
// how much ran. Member erasure never removes a political entry early: it
// only clears the member link (AnonymiseMember).

const (
	// AdLibraryPerPage is the library's page size.
	AdLibraryPerPage = 20
	adLibraryMaxPage = 1000
	adLibraryMaxQ    = 100
)

// AdLibraryItem is one library entry.
type AdLibraryItem struct {
	AdDisplay
	LegalName         string `json:"legalName"`
	PartyName         string `json:"partyName"`
	CandidateName     string `json:"candidateName"`
	Constituency      string `json:"constituency"`
	Placement         string `json:"placement"`
	StartDate         string `json:"startDate"`
	EndDate           string `json:"endDate"`
	Delivered         int64  `json:"delivered"`
	AmountPaidPesewas int64  `json:"amountPaidPesewas"`
	RefundedPesewas   int64  `json:"refundedPesewas"`
	Status            string `json:"status"`
	RemovalReason     string `json:"removalReason"`
}

// AdLibraryPage is GET /api/ads/library.
type AdLibraryPage struct {
	Items   []AdLibraryItem `json:"items"`
	Total   int             `json:"total"`
	Page    int             `json:"page"`
	PerPage int             `json:"perPage"`
}

// AdLibraryService reads the ad library.
type AdLibraryService struct {
	campaigns domain.AdRepository
	sponsors  domain.AdSponsorRepository
	log       *slog.Logger
	now       func() time.Time
}

// NewAdLibraryService builds the library. Without sponsors the legal and
// political names are left blank.
func NewAdLibraryService(campaigns domain.AdRepository, sponsors domain.AdSponsorRepository, log *slog.Logger) *AdLibraryService {
	if log == nil {
		log = slog.Default()
	}
	return &AdLibraryService{campaigns: campaigns, sponsors: sponsors, log: log, now: time.Now}
}

// AdLibraryQuery is a library request: tab political (the default) or
// running, a sponsor-name search and a 1-based page.
type AdLibraryQuery struct {
	Tab  string
	Q    string
	Page int
}

// normalise clamps the query to what the library serves.
func (q AdLibraryQuery) normalise() AdLibraryQuery {
	if q.Tab != domain.AdLibraryRunning {
		q.Tab = domain.AdLibraryPolitical
	}
	q.Q = strings.TrimSpace(q.Q)
	if utf8.RuneCountInString(q.Q) > adLibraryMaxQ {
		q.Q = string([]rune(q.Q)[:adLibraryMaxQ])
	}
	q.Page = min(max(q.Page, 1), adLibraryMaxPage)
	return q
}

// Library returns one page of a tab.
func (s *AdLibraryService) Library(ctx context.Context, q AdLibraryQuery) (*AdLibraryPage, error) {
	q = q.normalise()
	rows, total, err := s.campaigns.Library(ctx, domain.AdLibraryFilter{
		Tab: q.Tab, Query: q.Q, Now: s.now().UTC().Format(time.RFC3339), Page: q.Page, PerPage: AdLibraryPerPage,
	})
	if err != nil {
		return nil, err
	}
	out := &AdLibraryPage{Items: make([]AdLibraryItem, 0, len(rows)), Total: total, Page: q.Page, PerPage: AdLibraryPerPage}
	sponsors := map[string]*domain.AdSponsor{}
	for _, c := range rows {
		out.Items = append(out.Items, libraryItem(c, s.sponsor(ctx, sponsors, c.SponsorID)))
	}
	return out, nil
}

// sponsor loads a campaign's sponsor once per page (nil when unavailable).
func (s *AdLibraryService) sponsor(ctx context.Context, seen map[string]*domain.AdSponsor, id string) *domain.AdSponsor {
	if sp, ok := seen[id]; ok {
		return sp
	}
	var sp *domain.AdSponsor
	if s.sponsors != nil && id != "" {
		got, err := s.sponsors.Get(ctx, id)
		var nf *domain.NotFoundError
		switch {
		case err == nil:
			sp = got
		case !errors.As(err, &nf):
			s.log.Warn("ads: library sponsor lookup failed", "sponsor", id, logKeyErr, err)
		}
	}
	seen[id] = sp
	return sp
}

// libraryItem builds an entry. Political ads are public records: the
// sponsor's legal name, party, candidate and constituency, and the amount
// paid (the price snapshot's total once a payment succeeded) and refunded.
// A commercial ad shows only what readers saw (its "Sponsored ·" line): its
// sponsor may be a private individual, and the Privacy Notice publishes
// commercial sponsors' display names only.
func libraryItem(c domain.AdCampaign, sp *domain.AdSponsor) AdLibraryItem {
	item := AdLibraryItem{
		AdDisplay: adDisplay(c), Placement: c.Placement, StartDate: c.StartDate, EndDate: c.EndDate,
		Delivered: c.Delivered, Status: c.Status, RemovalReason: c.RemovalReason,
	}
	if !c.Political {
		return item
	}
	item.RefundedPesewas = c.RefundedPesewas
	if c.PaymentStatus == domain.AdPaymentSuccess {
		item.AmountPaidPesewas = c.Price.TotalPesewas
	}
	if sp != nil {
		item.LegalName, item.PartyName, item.CandidateName, item.Constituency = sp.LegalName, sp.PartyName, sp.CandidateName, sp.Constituency
	}
	return item
}
