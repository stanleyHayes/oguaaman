package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeBlockRepo is an in-memory BlockRepository with the same either-direction
// semantics as the Mongo implementation.
type fakeBlockRepo struct {
	rows []domain.MemberBlock
}

func (f *fakeBlockRepo) Block(_ context.Context, blocker, blocked, reason string) error {
	if blocker == "" || blocked == "" || blocker == blocked {
		return nil
	}
	for _, b := range f.rows {
		if b.BlockerID == blocker && b.BlockedID == blocked {
			return nil
		}
	}
	f.rows = append(f.rows, domain.MemberBlock{BlockerID: blocker, BlockedID: blocked, Reason: reason})
	return nil
}

func (f *fakeBlockRepo) Unblock(_ context.Context, blocker, blocked string) error {
	out := f.rows[:0]
	for _, b := range f.rows {
		if b.BlockerID == blocker && b.BlockedID == blocked {
			continue
		}
		out = append(out, b)
	}
	f.rows = out
	return nil
}

func (f *fakeBlockRepo) IsBlocked(_ context.Context, a, b string) (bool, error) {
	for _, r := range f.rows {
		if (r.BlockerID == a && r.BlockedID == b) || (r.BlockerID == b && r.BlockedID == a) {
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeBlockRepo) BlockedBy(_ context.Context, blocker string) ([]domain.MemberBlock, error) {
	out := []domain.MemberBlock{}
	for _, r := range f.rows {
		if r.BlockerID == blocker {
			out = append(out, r)
		}
	}
	return out, nil
}

func (f *fakeBlockRepo) HiddenFor(_ context.Context, id string) ([]string, error) {
	seen, out := map[string]bool{}, []string{}
	for _, r := range f.rows {
		other := ""
		switch id {
		case r.BlockerID:
			other = r.BlockedID
		case r.BlockedID:
			other = r.BlockerID
		}
		if other != "" && !seen[other] {
			seen[other] = true
			out = append(out, other)
		}
	}
	return out, nil
}

func (f *fakeBlockRepo) DeleteByMember(_ context.Context, id string) error {
	out := f.rows[:0]
	for _, r := range f.rows {
		if r.BlockerID == id || r.BlockedID == id {
			continue
		}
		out = append(out, r)
	}
	f.rows = out
	return nil
}

func blockSvc(repo *fakeBlockRepo) *Service {
	s := New(Deps{Blocks: repo})
	return s
}

// A block must hide content in BOTH directions. Hiding only the blocker's view
// would leave the person who asked for protection fully visible to the member
// they blocked.
func TestBlockIsSymmetric(t *testing.T) {
	repo := &fakeBlockRepo{}
	ctx := context.Background()
	if err := repo.Block(ctx, "alice", "bob", "harassment"); err != nil {
		t.Fatalf("block: %v", err)
	}

	for _, tc := range [][2]string{{"alice", "bob"}, {"bob", "alice"}} {
		got, err := repo.IsBlocked(ctx, tc[0], tc[1])
		if err != nil {
			t.Fatalf("IsBlocked(%s,%s): %v", tc[0], tc[1], err)
		}
		if !got {
			t.Errorf("IsBlocked(%s, %s) = false, want true — blocks must apply both ways", tc[0], tc[1])
		}
	}
}

func TestBlockIsIdempotentAndReversible(t *testing.T) {
	repo := &fakeBlockRepo{}
	ctx := context.Background()
	_ = repo.Block(ctx, "alice", "bob", "")
	_ = repo.Block(ctx, "alice", "bob", "")
	if len(repo.rows) != 1 {
		t.Errorf("blocking twice stored %d rows, want 1", len(repo.rows))
	}
	// Apple requires the member to be able to undo their own block.
	_ = repo.Unblock(ctx, "alice", "bob")
	if blocked, _ := repo.IsBlocked(ctx, "alice", "bob"); blocked {
		t.Error("still blocked after unblock")
	}
}

func TestBlockingYourselfIsANoOp(t *testing.T) {
	repo := &fakeBlockRepo{}
	_ = repo.Block(context.Background(), "alice", "alice", "")
	if len(repo.rows) != 0 {
		t.Errorf("self-block stored %d rows, want 0", len(repo.rows))
	}
}

func TestFilterBlockedDropsBothDirections(t *testing.T) {
	repo := &fakeBlockRepo{}
	ctx := context.Background()
	_ = repo.Block(ctx, "alice", "bob", "")   // alice blocked bob
	_ = repo.Block(ctx, "carol", "alice", "") // carol blocked alice
	s := blockSvc(repo)

	listings := []domain.Listing{
		{ID: "1", OwnerID: "bob"},
		{ID: "2", OwnerID: "carol"},
		{ID: "3", OwnerID: "dave"},
	}
	got := s.FilterBlockedListings(ctx, "alice", listings)
	if len(got) != 1 || got[0].ID != "3" {
		t.Errorf("FilterBlockedListings kept %v, want only the listing owned by dave", ids(got))
	}

	reviews := []domain.Review{{ID: "r1", MemberID: "bob"}, {ID: "r2", MemberID: "dave"}}
	gotRv := s.FilterBlockedReviews(ctx, "alice", reviews)
	if len(gotRv) != 1 || gotRv[0].ID != "r2" {
		t.Errorf("FilterBlockedReviews kept %d rows, want only r2", len(gotRv))
	}
}

// A signed-out viewer has no blocks, and filtering must not disturb the page.
func TestFilterIsANoOpForSignedOutViewers(t *testing.T) {
	repo := &fakeBlockRepo{}
	_ = repo.Block(context.Background(), "alice", "bob", "")
	s := blockSvc(repo)
	in := []domain.Listing{{ID: "1", OwnerID: "bob"}}
	if got := s.FilterBlockedListings(context.Background(), "", in); len(got) != 1 {
		t.Errorf("signed-out filter dropped %d of %d listings, want none dropped", len(in)-len(got), len(in))
	}
}

func TestForgetBlocksClearsBothDirections(t *testing.T) {
	repo := &fakeBlockRepo{}
	ctx := context.Background()
	_ = repo.Block(ctx, "alice", "bob", "")
	_ = repo.Block(ctx, "carol", "alice", "")
	if err := blockSvc(repo).ForgetBlocks(ctx, "alice"); err != nil {
		t.Fatalf("ForgetBlocks: %v", err)
	}
	if len(repo.rows) != 0 {
		t.Errorf("erasure left %d block rows naming alice, want 0", len(repo.rows))
	}
}

func ids(ls []domain.Listing) []string {
	out := make([]string, len(ls))
	for i, l := range ls {
		out[i] = l.ID
	}
	return out
}
