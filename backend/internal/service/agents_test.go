package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// memAgents is an in-memory AgentRepository keyed by id.
type memAgents struct{ rows map[string]domain.Agent }

func (m *memAgents) All(context.Context) ([]domain.Agent, error) {
	out := make([]domain.Agent, 0, len(m.rows))
	for _, a := range m.rows {
		out = append(out, a)
	}
	return out, nil
}
func (m *memAgents) ByID(_ context.Context, id string) (domain.Agent, error) {
	if a, ok := m.rows[id]; ok {
		return a, nil
	}
	return domain.Agent{}, &domain.NotFoundError{Entity: "agent"}
}
func (m *memAgents) BySlug(_ context.Context, slug string) (domain.Agent, error) {
	for _, a := range m.rows {
		if a.Slug == slug {
			return a, nil
		}
	}
	return domain.Agent{}, &domain.NotFoundError{Entity: "agent"}
}
func (m *memAgents) ByMemberID(_ context.Context, memberID string) (domain.Agent, error) {
	for _, a := range m.rows {
		if a.MemberID == memberID {
			return a, nil
		}
	}
	return domain.Agent{}, &domain.NotFoundError{Entity: "agent"}
}
func (m *memAgents) Create(_ context.Context, a domain.Agent) (domain.Agent, error) {
	m.rows[a.ID] = a
	return a, nil
}
func (m *memAgents) Update(_ context.Context, a domain.Agent) (domain.Agent, error) {
	m.rows[a.ID] = a
	return a, nil
}
func (m *memAgents) Delete(_ context.Context, id string) error {
	delete(m.rows, id)
	return nil
}
func (m *memAgents) InsertMany(_ context.Context, agents []domain.Agent) error {
	for _, a := range agents {
		m.rows[a.ID] = a
	}
	return nil
}

func agentInput(idDoc string) AgentInput {
	return AgentInput{
		Type: domain.AgentTypeIndividual, DisplayName: "Kwame Mensah", Headline: "Accra errands",
		Services: []string{"errands"}, CoverageAreas: []string{"Accra"}, IDDocURL: idDoc,
		Guarantor:    domain.AgentGuarantor{Name: "Auntie Efua", Phone: "0240000000"},
		PayoutMethod: "momo", PayoutDetail: "0241111111",
	}
}

func verifiedAgentSvc() (*Service, *memAgents) {
	repo := &memAgents{rows: map[string]domain.Agent{"agent-1": {
		ID: "agent-1", Slug: "kwame", MemberID: "m-agent", Status: domain.AgentStatusVerified,
		Type: domain.AgentTypeIndividual, DisplayName: "Kwame Mensah", Headline: "Accra errands",
		Services: []string{"errands"}, CoverageAreas: []string{"accra"},
		IDDocURL:  "https://res.cloudinary.com/x/ghana-card.jpg", // an older public upload
		Guarantor: domain.AgentGuarantor{Name: "Auntie Efua", Phone: "0240000000"}, PayoutMethod: "momo", PayoutDetail: "0241111111",
		VerifiedByID: "m-vet", VerifiedByName: "Officer Vet", VerifiedAt: "2026-09-01T00:00:00Z",
	}}}
	return &Service{agents: repo}, repo
}

// F057/F060: changing what was vetted puts a verified agent back in the queue.
func TestVettedAgentChangesNeedVettingAgain(t *testing.T) {
	for name, edit := range map[string]func(*AgentInput){
		"display name": func(in *AgentInput) { in.DisplayName = "Ghana Revenue Authority Clearing Desk" },
		"type":         func(in *AgentInput) { in.Type = domain.AgentTypeOffice },
		"guarantor":    func(in *AgentInput) { in.Guarantor.Name = "Someone Else" },
		"government ID": func(in *AgentInput) {
			in.IDDocURL = "private:another-card"
		},
		"payout number": func(in *AgentInput) { in.PayoutDetail = "0249999999" },
	} {
		t.Run(name, func(t *testing.T) {
			svc, repo := verifiedAgentSvc()
			in := agentInput("https://res.cloudinary.com/x/ghana-card.jpg")
			edit(&in)
			got, err := svc.UpdateMyAgent(context.Background(), "m-agent", in)
			if err != nil {
				t.Fatal(err)
			}
			if got.Status != domain.AgentStatusPending || got.VerifiedByName != "" || got.VerifiedAt != "" {
				t.Fatalf("still verified after a vetted change: %+v", got)
			}
			if list, _ := svc.Agents(context.Background(), "", ""); len(list) != 0 {
				t.Fatal("an unvetted identity stayed in the public directory")
			}
			if repo.rows["agent-1"].Status != domain.AgentStatusPending {
				t.Fatal("status not saved")
			}
		})
	}
}

func TestDescriptiveAgentEditsKeepVerification(t *testing.T) {
	svc, _ := verifiedAgentSvc()
	in := agentInput("https://res.cloudinary.com/x/ghana-card.jpg")
	in.Headline, in.Bio, in.Rates = "Accra and Kumasi errands", "Ten years on the road.", "from GH₵ 50"
	got, err := svc.UpdateMyAgent(context.Background(), "m-agent", in)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != domain.AgentStatusVerified || got.VerifiedByName != "Officer Vet" {
		t.Fatalf("a descriptive edit dropped verification: %+v", got)
	}
}

// Contract K8: a new government ID must be a private upload ref.
func TestAgentIDDocumentMustBeAPrivateUpload(t *testing.T) {
	svc, _ := verifiedAgentSvc()
	_, err := svc.UpdateMyAgent(context.Background(), "m-agent", agentInput("https://res.cloudinary.com/x/new-card.jpg"))
	var ve *domain.ValidationError
	if !errors.As(err, &ve) || ve.Message != msgIDNeedsPrivateUpload {
		t.Fatalf("new public ID URL on update: err=%v", err)
	}
	fresh := &Service{agents: &memAgents{rows: map[string]domain.Agent{}}}
	if _, err = fresh.ApplyAsAgent(context.Background(), domain.Member{ID: "m-new"}, agentInput("https://res.cloudinary.com/x/card.jpg")); !errors.As(err, &ve) {
		t.Fatalf("new application with a public ID URL: err=%v", err)
	}
	a, err := fresh.ApplyAsAgent(context.Background(), domain.Member{ID: "m-new"}, agentInput("private:card-123"))
	if err != nil || a.Status != domain.AgentStatusPending || a.IDDocURL != "private:card-123" {
		t.Fatalf("private ID application: %+v %v", a, err)
	}
}
