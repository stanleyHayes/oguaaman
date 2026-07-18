package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── Oguaa Outside — verified agents (slice 1: directory + vetting) ────────────
//
// Agents are vetted members who act for Cape Coast people elsewhere, for a fee.
// This slice covers the profile + application + the background-check vetting
// (identity, guarantor, bond) done by a Vetting officer. Jobs + Paystack escrow
// arrive in later slices. Curators cannot self-approve — vetting is its own role.

// DefaultAgentBondPesewas is the refundable bond an applicant must post (GHS 200).
const DefaultAgentBondPesewas int64 = 20000

var validAgentServiceSet = func() map[string]bool {
	m := map[string]bool{}
	for _, s := range domain.AgentServices {
		m[s.Slug] = true
	}
	return m
}()

// AgentInput is the apply/update payload. The client uploads the ID via
// POST /api/uploads first and passes the returned URL as idDocUrl.
type AgentInput struct {
	Type          string                `json:"type"`
	DisplayName   string                `json:"displayName"`
	Headline      string                `json:"headline"`
	Bio           string                `json:"bio"`
	Services      []string              `json:"services"`
	CoverageAreas []string              `json:"coverageAreas"`
	Rates         string                `json:"rates"`
	IDDocURL      string                `json:"idDocUrl"`
	Guarantor     domain.AgentGuarantor `json:"guarantor"`
	PayoutMethod  string                `json:"payoutMethod"`
	PayoutDetail  string                `json:"payoutDetail"`
}

// redactAgent strips the private vetting/payout details from an agent before it
// is shown publicly. The owner (MyAgent) and admin see the full record.
func redactAgent(a domain.Agent) domain.Agent {
	a.IDDocURL = ""
	a.Guarantor = domain.AgentGuarantor{}
	a.Bond.Reference = ""
	a.PayoutMethod = ""
	a.PayoutDetail = ""
	return a
}

// Agents returns the public directory: verified agents only, optionally filtered
// by a service slug and/or a coverage area, best-rated first, redacted.
func (s *Service) Agents(ctx context.Context, service, area string) ([]domain.Agent, error) {
	rows, err := s.agents.All(ctx)
	if err != nil {
		return nil, err
	}
	service = strings.ToLower(strings.TrimSpace(service))
	area = strings.ToLower(strings.TrimSpace(area))
	out := make([]domain.Agent, 0, len(rows))
	for _, a := range rows {
		if a.Status != domain.AgentStatusVerified {
			continue
		}
		if service != "" && !containsFold(a.Services, service) {
			continue
		}
		if area != "" && !containsFold(a.CoverageAreas, area) {
			continue
		}
		out = append(out, redactAgent(a))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RatingAvg != out[j].RatingAvg {
			return out[i].RatingAvg > out[j].RatingAvg
		}
		if out[i].JobsCompleted != out[j].JobsCompleted {
			return out[i].JobsCompleted > out[j].JobsCompleted
		}
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

// Agent returns one verified agent by slug (public, redacted). Non-verified
// profiles are hidden from the public.
func (s *Service) Agent(ctx context.Context, slug string) (domain.Agent, error) {
	a, err := s.agents.BySlug(ctx, slug)
	if err != nil {
		return domain.Agent{}, err
	}
	if a.Status != domain.AgentStatusVerified {
		return domain.Agent{}, &domain.NotFoundError{Entity: "agent"}
	}
	return redactAgent(a), nil
}

// MyAgent returns the caller's own agent profile in full (or a not-found error).
func (s *Service) MyAgent(ctx context.Context, memberID string) (domain.Agent, error) {
	return s.agents.ByMemberID(ctx, memberID)
}

// ApplyAsAgent creates a pending agent profile for the member and posts the
// (still-unpaid) bond. A member may hold only one profile.
func (s *Service) ApplyAsAgent(ctx context.Context, member domain.Member, in AgentInput) (domain.Agent, error) {
	if existing, err := s.agents.ByMemberID(ctx, member.ID); err == nil && existing.ID != "" {
		return domain.Agent{}, fmt.Errorf("you already have an agent profile")
	}
	a, err := s.buildAgent(in)
	if err != nil {
		return domain.Agent{}, err
	}
	now := time.Now().UTC()
	a.ID = "agent-" + fmt.Sprintf("%d", now.UnixNano())
	a.Slug = slugify(in.DisplayName) + "-" + fmt.Sprintf("%d", now.UnixNano()%1_000_000)
	a.MemberID = member.ID
	a.Status = domain.AgentStatusPending
	a.Bond = domain.AgentBond{AmountPesewas: DefaultAgentBondPesewas, Status: domain.BondStatusPending}
	a.CreatedAt = now.Format(time.RFC3339)
	return s.agents.Create(ctx, a)
}

// UpdateMyAgent edits the caller's editable profile fields (never status/vetting).
func (s *Service) UpdateMyAgent(ctx context.Context, memberID string, in AgentInput) (domain.Agent, error) {
	existing, err := s.agents.ByMemberID(ctx, memberID)
	if err != nil {
		return domain.Agent{}, err
	}
	patch, err := s.buildAgent(in)
	if err != nil {
		return domain.Agent{}, err
	}
	existing.Type = patch.Type
	existing.DisplayName = patch.DisplayName
	existing.Headline = patch.Headline
	existing.Bio = patch.Bio
	existing.Services = patch.Services
	existing.CoverageAreas = patch.CoverageAreas
	existing.Rates = patch.Rates
	existing.Guarantor = patch.Guarantor
	existing.PayoutMethod = patch.PayoutMethod
	existing.PayoutDetail = patch.PayoutDetail
	if strings.TrimSpace(in.IDDocURL) != "" {
		existing.IDDocURL = strings.TrimSpace(in.IDDocURL)
	}
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.agents.Update(ctx, existing)
}

// AdminAgents returns every agent (full records) for the back-office, optionally
// filtered by status (e.g. "pending" for the vetting queue).
func (s *Service) AdminAgents(ctx context.Context, status string) ([]domain.Agent, error) {
	rows, err := s.agents.All(ctx)
	if err != nil {
		return nil, err
	}
	status = strings.TrimSpace(status)
	if status == "" {
		return rows, nil
	}
	out := make([]domain.Agent, 0, len(rows))
	for _, a := range rows {
		if a.Status == status {
			out = append(out, a)
		}
	}
	return out, nil
}

// VerifyAgent approves an agent after the background check (Vetting officer). It
// marks the bond held (the Paystack charge lands in the payments slice).
func (s *Service) VerifyAgent(ctx context.Context, id string, officer domain.Member) (domain.Agent, error) {
	a, err := s.agents.ByID(ctx, id)
	if err != nil {
		return domain.Agent{}, err
	}
	now := time.Now().UTC()
	a.Status = domain.AgentStatusVerified
	a.RejectionReason = ""
	a.VerifiedByID = officer.ID
	a.VerifiedByName = officer.DisplayName
	a.VerifiedAt = now.Format(time.RFC3339)
	if a.Bond.Status == domain.BondStatusPending {
		a.Bond.Status = domain.BondStatusHeld
	}
	a.UpdatedAt = now.Format(time.RFC3339)
	return s.agents.Update(ctx, a)
}

// RejectAgent declines an application with a reason (Vetting officer).
func (s *Service) RejectAgent(ctx context.Context, id, reason string, officer domain.Member) (domain.Agent, error) {
	a, err := s.agents.ByID(ctx, id)
	if err != nil {
		return domain.Agent{}, err
	}
	now := time.Now().UTC()
	a.Status = domain.AgentStatusRejected
	a.RejectionReason = strings.TrimSpace(reason)
	a.VerifiedByID = officer.ID
	a.VerifiedByName = officer.DisplayName
	a.UpdatedAt = now.Format(time.RFC3339)
	return s.agents.Update(ctx, a)
}

// SuspendAgent takes a verified agent off the directory (Vetting officer).
func (s *Service) SuspendAgent(ctx context.Context, id string, officer domain.Member) (domain.Agent, error) {
	a, err := s.agents.ByID(ctx, id)
	if err != nil {
		return domain.Agent{}, err
	}
	a.Status = domain.AgentStatusSuspended
	a.VerifiedByID = officer.ID
	a.VerifiedByName = officer.DisplayName
	a.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.agents.Update(ctx, a)
}

// buildAgent validates + normalises an AgentInput into an Agent (identity/status
// left to the caller).
func (s *Service) buildAgent(in AgentInput) (domain.Agent, error) {
	typ := strings.TrimSpace(in.Type)
	if typ != domain.AgentTypeIndividual && typ != domain.AgentTypeOffice {
		return domain.Agent{}, fmt.Errorf("choose whether you are an individual or an office")
	}
	name := strings.TrimSpace(in.DisplayName)
	if len(name) < 2 || len(name) > 120 {
		return domain.Agent{}, fmt.Errorf("name must be 2–120 characters")
	}
	services := cleanList(in.Services)
	if len(services) == 0 {
		return domain.Agent{}, fmt.Errorf("choose at least one service you offer")
	}
	for _, sv := range services {
		if !validAgentServiceSet[sv] {
			return domain.Agent{}, fmt.Errorf("unknown service %q", sv)
		}
	}
	areas := cleanList(in.CoverageAreas)
	if len(areas) == 0 {
		return domain.Agent{}, fmt.Errorf("name at least one place you cover")
	}
	if strings.TrimSpace(in.Guarantor.Name) == "" || strings.TrimSpace(in.Guarantor.Phone) == "" {
		return domain.Agent{}, fmt.Errorf("a Cape Coast guarantor (name and phone) is required")
	}
	if strings.TrimSpace(in.IDDocURL) == "" {
		return domain.Agent{}, fmt.Errorf("a government ID is required")
	}
	return domain.Agent{
		Type:          typ,
		DisplayName:   name,
		Headline:      strings.TrimSpace(in.Headline),
		Bio:           strings.TrimSpace(in.Bio),
		Services:      services,
		CoverageAreas: areas,
		Rates:         strings.TrimSpace(in.Rates),
		IDDocURL:      strings.TrimSpace(in.IDDocURL),
		Guarantor: domain.AgentGuarantor{
			Name:     strings.TrimSpace(in.Guarantor.Name),
			Phone:    strings.TrimSpace(in.Guarantor.Phone),
			Relation: strings.TrimSpace(in.Guarantor.Relation),
			Note:     strings.TrimSpace(in.Guarantor.Note),
		},
		PayoutMethod: strings.TrimSpace(in.PayoutMethod),
		PayoutDetail: strings.TrimSpace(in.PayoutDetail),
	}, nil
}

func cleanList(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, v := range in {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func containsFold(list []string, v string) bool {
	for _, x := range list {
		if strings.EqualFold(strings.TrimSpace(x), v) {
			return true
		}
	}
	return false
}
