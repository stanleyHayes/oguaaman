package http

import (
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

func (h *Handler) RequestArtistBooking(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoMemberID, DisplayName: "Demo Member"}
	}
	if h.rateLimited(w, r, "artist-booking:"+m.ID, 6, 24*time.Hour) {
		return
	}
	var in service.ArtistBookingInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	booking, err := h.artistBookings.Request(r.Context(), m, r.PathValue("slug"), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, booking)
}

func (h *Handler) MyArtistBookings(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoMemberID}
	}
	bookings, err := h.artistBookings.ForOwner(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, bookings)
}

func (h *Handler) UpdateArtistBookingStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoMemberID}
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	booking, err := h.artistBookings.UpdateStatus(r.Context(), m.ID, r.PathValue("id"), in.Status, in.Note)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, booking)
}
