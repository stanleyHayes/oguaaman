package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── event ticketing (Phase 6): tiers, Paystack purchase, gate check-in ────────

// Event is the public event detail: the approved event plus its ticket tiers
// with sold/remaining counts.
func (h *Handler) Event(w http.ResponseWriter, r *http.Request) {
	view, err := h.tickets.EventView(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// BuyTicket starts a ticket payment for one tier. Requires a signed-in member
// (the ticket is attributed and the receipt email defaults to theirs).
func (h *Handler) BuyTicket(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "ticket:"+clientKey(r), 20, time.Hour) {
		return
	}
	var in struct {
		Tier string `json:"tier"`
		Qty  int    `json:"qty"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	memberID, email := "", ""
	if m != nil {
		memberID = m.ID
		email = m.Email
	}
	if email == "" {
		email = "tickets@oguaa.test" // dev mode without auth — Paystack requires an email
	}
	authURL, reference, err := h.tickets.StartTicketPurchase(r.Context(), r.PathValue("slug"), memberID, email, in.Tier, in.Qty)
	if errors.Is(err, service.ErrTicketQty) || errors.Is(err, service.ErrTierNotFound) || errors.Is(err, service.ErrSoldOut) {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadGateway, "Could not start the payment. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authorizationUrl": authURL,
		"reference":        reference,
		"simulated":        h.tickets.Simulated(),
	})
}

// ConfirmTicket verifies a transaction after the buyer returns from Paystack.
func (h *Handler) ConfirmTicket(w http.ResponseWriter, r *http.Request) {
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	ticket, err := h.tickets.ConfirmTicket(r.Context(), reference)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ticket)
}

// MyTickets — the signed-in member's tickets.
func (h *Handler) MyTickets(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []domain.Ticket{})
		return
	}
	tickets, err := h.tickets.MemberTickets(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tickets)
}

// AdminEventTickets — the sales ledger for one event (curator/steward only).
func (h *Handler) AdminEventTickets(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	tickets, err := h.tickets.EventTickets(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, tickets)
}

// AdminCheckIn admits one ticket by its check-in code (curator/steward only).
// A second scan returns 409 with the original gate time.
func (h *Handler) AdminCheckIn(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator")
	if !ok {
		return
	}
	role := "steward" // dev mode (no auth) — the back-office is open
	if m != nil {
		role = m.Role
	}
	ticket, err := h.tickets.CheckIn(r.Context(), r.PathValue("code"), role)
	if err != nil {
		var used *service.AlreadyCheckedInError
		if errors.As(err, &used) {
			fail(w, http.StatusConflict, "Already admitted — first scanned at "+used.At)
			return
		}
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ticket)
}
