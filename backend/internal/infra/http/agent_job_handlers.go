package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── Oguaa Outside — jobs + escrow (slice 2) ──────────────────────────────────

// jobErr maps service errors to the right status (forbidden/not-found → mapped;
// validation → 400).
func (h *Handler) jobErr(w http.ResponseWriter, err error) {
	var fb *domain.ForbiddenError
	var nf *domain.NotFoundError
	if errors.As(err, &fb) || errors.As(err, &nf) {
		h.handleErr(w, err)
		return
	}
	fail(w, http.StatusBadRequest, err.Error())
}

// RequestJob — a client opens a job request to an agent.
func (h *Handler) RequestJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in service.JobInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	j, err := h.agentJobs.RequestJob(r.Context(), r.PathValue("slug"), *orDevMember(m), in)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, j)
}

// QuoteJob — the agent sets a firm price.
func (h *Handler) QuoteJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in struct {
		AmountPesewas int64  `json:"amountPesewas"`
		Note          string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	j, err := h.agentJobs.QuoteJob(r.Context(), r.PathValue("id"), orDevMember(m).ID, in.AmountPesewas, in.Note)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// AcceptJob — the client accepts the quote and funds escrow (returns the
// Paystack authorization URL to complete payment).
func (h *Handler) AcceptJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	authURL, accessCode, reference, err := h.agentJobs.AcceptAndFund(r.Context(), r.PathValue("id"), orDevMember(m).ID, in.Email)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authorizationUrl": authURL,
		"accessCode":       accessCode,
		"reference":        reference,
		"simulated":        h.agentJobs.Simulated(),
	})
}

// ConfirmJob — verifies the escrow charge (called on redirect back / webhook).
func (h *Handler) ConfirmJob(w http.ResponseWriter, r *http.Request) {
	j, err := h.agentJobs.ConfirmFunding(r.Context(), r.URL.Query().Get("reference"))
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// DeliverJob — the agent marks the work delivered.
func (h *Handler) DeliverJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	j, err := h.agentJobs.DeliverJob(r.Context(), r.PathValue("id"), orDevMember(m).ID)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// CompleteJob — the client confirms delivery; escrow releases to the agent.
func (h *Handler) CompleteJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	j, err := h.agentJobs.CompleteJob(r.Context(), r.PathValue("id"), orDevMember(m).ID)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// DisputeJob — either party raises a dispute for admin resolution.
func (h *Handler) DisputeJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	j, err := h.agentJobs.DisputeJob(r.Context(), r.PathValue("id"), orDevMember(m).ID, in.Reason)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// CancelJob — either party ends a job before it is funded.
func (h *Handler) CancelJob(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	j, err := h.agentJobs.CancelJob(r.Context(), r.PathValue("id"), orDevMember(m).ID)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// JobByID — one job, for a party to it.
func (h *Handler) JobByID(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	j, err := h.agentJobs.Job(r.Context(), r.PathValue("id"), orDevMember(m).ID)
	if err != nil {
		h.jobErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

// MyJobs — the caller's jobs on both sides (as client and as agent).
func (h *Handler) MyJobs(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	id := orDevMember(m).ID
	asClient, err := h.agentJobs.MyClientJobs(r.Context(), id)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	asAgent, err := h.agentJobs.MyAgentJobs(r.Context(), id)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"asClient": asClient, "asAgent": asAgent})
}
