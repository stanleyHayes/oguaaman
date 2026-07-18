package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// ── Oguaa Outside agents seed (GET /api/agents) ──────────────────────────────
// A few vetted demo agents so the directory has content, plus one pending
// application so the vetting queue is not empty. Sensitive fields (ID, guarantor
// contact) are redacted from the public API by the service.

var seedAgents = []domain.Agent{
	{
		ID: "agent-kwame-accra", Slug: "kwame-mensah-accra", MemberID: "m-kwame",
		Type: domain.AgentTypeIndividual, DisplayName: "Kwame Mensah",
		Headline: "Accra procurement & errands — same-day pickups",
		Bio:      "Cape Coast son based in Accra for nine years. I buy from the Accra markets, handle official errands at the ministries, and courier it down to Oguaa. I quote one fair price and send you photos before I pay.",
		Services: []string{"local-procurement", "errands", "official"}, CoverageAreas: []string{"accra", "tema"},
		Rates:    "10% of order value, min GHS 50 + transport.",
		Status:   domain.AgentStatusVerified,
		IDDocURL: "seed://id", Guarantor: domain.AgentGuarantor{Name: "Auntie Efua Baiden", Phone: "+233200000001", Relation: "family friend", Note: "Kotokuraba trader, known 20 years"},
		Bond:           domain.AgentBond{AmountPesewas: 20000, Status: domain.BondStatusHeld},
		VerifiedByName: "Oguaa Vetting Office", VerifiedAt: "2026-05-02T10:00:00Z",
		RatingAvg: 4.8, RatingCount: 23, JobsCompleted: 31,
		PayoutMethod: "momo", PayoutDetail: "MTN ****0001",
		CreatedAt: "2026-04-20T09:00:00Z",
	},
	{
		ID: "agent-oguaa-import", Slug: "oguaa-import-hub", MemberID: "m-import",
		Type: domain.AgentTypeOffice, DisplayName: "Oguaa Import Hub",
		Headline: "China sourcing, quality-check & sea/air freight",
		Bio:      "A registered office coordinating orders from Guangzhou and Yiwu — we inspect the goods, negotiate, consolidate and ship to Tema, then deliver to Cape Coast. Escrow only; nothing ships before you approve photos.",
		Services: []string{"import", "shipping", "inspection"}, CoverageAreas: []string{"china", "guangzhou", "tema"},
		Rates:    "Service fee 7% + verified freight cost.",
		Status:   domain.AgentStatusVerified,
		IDDocURL: "seed://id", Guarantor: domain.AgentGuarantor{Name: "Nana Kojo Ansah", Phone: "+233200000002", Relation: "board referee", Note: "Registered with the CC Metro Assembly"},
		Bond:           domain.AgentBond{AmountPesewas: 50000, Status: domain.BondStatusHeld},
		VerifiedByName: "Oguaa Vetting Office", VerifiedAt: "2026-03-15T10:00:00Z",
		RatingAvg: 4.6, RatingCount: 41, JobsCompleted: 58,
		PayoutMethod: "bank", PayoutDetail: "GCB ****4412",
		CreatedAt: "2026-03-01T09:00:00Z",
	},
	{
		ID: "agent-efua-travel", Slug: "efua-baiden-travel", MemberID: "m-efua",
		Type: domain.AgentTypeIndividual, DisplayName: "Efua Baiden",
		Headline: "Travel companion & inspection — Accra & Kumasi",
		Bio:      "I accompany elders and first-time travellers to Accra and Kumasi for hospital visits, passport and embassy appointments, and I inspect a room, a car or a shop before you send money.",
		Services: []string{"travel", "inspection", "errands"}, CoverageAreas: []string{"accra", "kumasi"},
		Rates:    "GHS 150/day + transport.",
		Status:   domain.AgentStatusVerified,
		IDDocURL: "seed://id", Guarantor: domain.AgentGuarantor{Name: "Rev. Yaw Otchere", Phone: "+233200000003", Relation: "pastor", Note: "Ebenezer Church, Cape Coast"},
		Bond:           domain.AgentBond{AmountPesewas: 20000, Status: domain.BondStatusHeld},
		VerifiedByName: "Oguaa Vetting Office", VerifiedAt: "2026-06-10T10:00:00Z",
		RatingAvg: 4.9, RatingCount: 12, JobsCompleted: 15,
		PayoutMethod: "momo", PayoutDetail: "Vodafone ****0003",
		CreatedAt: "2026-05-28T09:00:00Z",
	},
	{
		// Pending — populates the vetting queue; hidden from the public directory.
		ID: "agent-yaw-kumasi", Slug: "yaw-otchere-kumasi", MemberID: "m-yaw",
		Type: domain.AgentTypeIndividual, DisplayName: "Yaw Otchere",
		Headline: "Kumasi market runs & spare parts",
		Bio:      "New applicant — Suame Magazine spare parts and Kejetia market procurement.",
		Services: []string{"local-procurement", "errands"}, CoverageAreas: []string{"kumasi"},
		Rates:    "12% of order value.",
		Status:   domain.AgentStatusPending,
		IDDocURL: "seed://id", Guarantor: domain.AgentGuarantor{Name: "Maame Abena", Phone: "+233200000004", Relation: "aunt", Note: "Cape Coast fishmonger"},
		Bond:      domain.AgentBond{AmountPesewas: 20000, Status: domain.BondStatusPending},
		CreatedAt: "2026-07-14T09:00:00Z",
	},
}

// seedAgentsData loads the demo agents (seed only).
func seedAgentsData(ctx context.Context, db *mongo.Database) error {
	return insertAll(ctx, db.Collection(collAgents), seedAgents)
}

// SeedAgentsOnly drops and reloads ONLY the agents collection — a targeted,
// non-destructive top-up (mirrors SeedCivicOnly / SeedGoalsOnly). Idempotent.
func SeedAgentsOnly(ctx context.Context, db *mongo.Database) error {
	if err := db.Collection(collAgents).Drop(ctx); err != nil {
		return err
	}
	return seedAgentsData(ctx, db)
}
