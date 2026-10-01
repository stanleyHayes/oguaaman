package service

import (
	"context"
	"time"
)

// SetAIConsent records (true) or withdraws (false) the member's consent to the
// writing assistant sending the text they select to the AI provider
// (contract K15). The AI endpoints refuse members without it. Returns the
// resulting consent state.
func (s *Service) SetAIConsent(ctx context.Context, memberID string, consent bool) (bool, error) {
	at := ""
	if consent {
		at = time.Now().UTC().Format(time.RFC3339)
	}
	if err := s.members.SetAIConsent(ctx, memberID, at); err != nil {
		return false, err
	}
	if s.log != nil {
		s.log.Info("consent: ai writing assistant", "memberId", memberID, "consent", consent)
	}
	return consent, nil
}
