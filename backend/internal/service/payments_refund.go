package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// ── Paystack refunds (spec §1.5, D5) ─────────────────────────────────────────
//
// Refunds are rare by design (ads are reviewed before payment) but needed for
// under-delivery, cancellations and election blackouts. They go through
// POST /refund with our own transaction reference and are polled with
// GET /refund/{id} [A4]; refund webhooks are ignored. The Paystack account is
// shared with the owner's other apps, so only references Oguaa issued
// ("oguaa-…") may ever be refunded.

// Paystack refund statuses (RefundResult.Status).
const (
	RefundPending        = "pending"
	RefundProcessing     = "processing"
	RefundProcessed      = "processed"
	RefundFailed         = "failed"
	RefundNeedsAttention = "needs-attention"
)

// ErrForeignReference refuses to refund a transaction Oguaa did not issue:
// the shared Paystack account also carries the owner's other apps (C5).
var ErrForeignReference = errors.New("refusing to refund a reference that is not Oguaa's")

// ErrRefundAmount refuses a refund of zero or less.
var ErrRefundAmount = errors.New("refund amount must be positive")

// RefundResult is Paystack's answer about one refund.
type RefundResult struct {
	RefundID string
	Status   string // pending | processing | processed | failed | needs-attention
}

// RefundingPaystack is a payment client that can refund.
type RefundingPaystack interface {
	PaystackClient
	// Refund asks Paystack to return amountPesewas of the transaction with our
	// reference (POST /refund {transaction, amount, merchant_note}).
	Refund(ctx context.Context, reference string, amountPesewas int64, note string) (RefundResult, error)
	// RefundStatus polls one refund (GET /refund/{id}).
	RefundStatus(ctx context.Context, refundID string) (RefundResult, error)
}

// PlatformPaystack is everything the server's payment client offers: the
// transaction seam, the marketplace operations and refunds. PaystackFor
// returns one.
type PlatformPaystack interface {
	CommercePaystack
	RefundingPaystack
}

// checkRefund refuses foreign references and non-positive amounts.
func checkRefund(reference string, amountPesewas int64) error {
	if !strings.HasPrefix(reference, RefNamespace) {
		return ErrForeignReference
	}
	if amountPesewas <= 0 {
		return ErrRefundAmount
	}
	return nil
}

// maxRefundNote bounds the merchant note sent with a refund.
const maxRefundNote = 200

// refundEnvelope is Paystack's reply to both refund calls.
type refundEnvelope struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		ID     json.RawMessage `json:"id"` // a number today; tolerate a string
		Status string          `json:"status"`
	} `json:"data"`
}

func (p *paystackHTTP) Refund(ctx context.Context, reference string, amountPesewas int64, note string) (RefundResult, error) {
	if err := checkRefund(reference, amountPesewas); err != nil {
		return RefundResult{}, err
	}
	if r := []rune(note); len(r) > maxRefundNote {
		note = string(r[:maxRefundNote])
	}
	body, _ := json.Marshal(map[string]any{"transaction": reference, "amount": amountPesewas, "merchant_note": note})
	return p.refundCall(ctx, http.MethodPost, "/refund", body)
}

func (p *paystackHTTP) RefundStatus(ctx context.Context, refundID string) (RefundResult, error) {
	if strings.TrimSpace(refundID) == "" {
		return RefundResult{}, errors.New("paystack refund status needs a refund id")
	}
	return p.refundCall(ctx, http.MethodGet, "/refund/"+url.PathEscape(refundID), nil)
}

// refundCall makes one refund API call and reads the refund out of it.
func (p *paystackHTTP) refundCall(ctx context.Context, method, path string, body []byte) (RefundResult, error) {
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.base+path, rd)
	if err != nil {
		return RefundResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.http.Do(req)
	if err != nil {
		return RefundResult{}, fmt.Errorf("paystack refund call failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed refundEnvelope
	decodeErr := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed)
	if resp.StatusCode/100 != 2 || decodeErr != nil || !parsed.Status {
		return RefundResult{}, fmt.Errorf("paystack refund rejected (HTTP %d): %s", resp.StatusCode, parsed.Message)
	}
	id := strings.Trim(strings.TrimSpace(string(parsed.Data.ID)), `"`)
	if id == "" || id == "null" {
		return RefundResult{}, fmt.Errorf("paystack refund reply carried no refund id: %s", parsed.Message)
	}
	return RefundResult{RefundID: id, Status: strings.ToLower(strings.TrimSpace(parsed.Data.Status))}, nil
}

// simulatedRefundPrefix marks refund ids the simulation made up.
const simulatedRefundPrefix = "sim-"

// Refund in the simulation moves no money and reports it processed at once.
func (s SimulatedPaystack) Refund(_ context.Context, reference string, amountPesewas int64, note string) (RefundResult, error) {
	if err := checkRefund(reference, amountPesewas); err != nil {
		return RefundResult{}, err
	}
	if s.Log != nil {
		s.Log.Info("SIMULATED Paystack refund — no real money moves", "ref", reference, "amount", amountPesewas, "note", note)
	}
	return RefundResult{RefundID: simulatedRefundPrefix + reference, Status: RefundProcessed}, nil
}

// RefundStatus in the simulation: every refund is processed.
func (s SimulatedPaystack) RefundStatus(_ context.Context, refundID string) (RefundResult, error) {
	return RefundResult{RefundID: refundID, Status: RefundProcessed}, nil
}
