package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// F036 / K13: public reads drop listings, tributes and articles by members in
// a block with the viewer, in either direction.
func TestViewListings_enforcesBlocks(t *testing.T) {
	ctx := context.Background()
	blocks := &fakeBlockRepo{}
	_ = blocks.Block(ctx, "m-kofi", "m-ama", "") // Kofi blocked Ama
	svc := tributeService(&fakeRepo{}, blocks)
	items := []domain.Listing{
		{ID: "e-1", Type: domain.TypeEvent, OwnerID: "m-kofi"},
		{ID: "e-2", Type: domain.TypeEvent, OwnerID: "m-esi"},
		{ID: "mem-1", Type: domain.TypeMemorial, OwnerID: "m-esi", Tributes: []domain.Tribute{
			{ID: "t-1", MemberID: "m-kofi"}, {ID: "t-2", MemberID: "m-esi"}, {ID: "t-3", MemberID: "m-esi", Status: domain.TributeRemoved},
		}},
	}
	got := svc.ViewListings(ctx, &domain.Member{ID: "m-ama"}, items)
	if len(got) != 2 || got[0].ID != "e-2" {
		t.Fatalf("blocked owner's listing leaked: %+v", got)
	}
	if len(got[1].Tributes) != 1 || got[1].Tributes[0].ID != "t-2" {
		t.Fatalf("tributes = %+v, want only t-2", got[1].Tributes)
	}
	if all := svc.ViewListings(ctx, nil, items); len(all) != 3 || len(all[2].Tributes) != 2 {
		t.Fatalf("signed-out viewers see every visible item: %+v", all)
	}
	var nf *domain.NotFoundError
	if _, err := svc.ViewListing(ctx, &domain.Member{ID: "m-kofi"}, &domain.Listing{ID: "x", Type: domain.TypeEvent, OwnerID: "m-ama"}); !errors.As(err, &nf) {
		t.Fatalf("detail across a block: got %v, want not found", err)
	}
	news := svc.FilterBlockedNews(ctx, &domain.Member{ID: "m-ama"}, []domain.NewsArticle{{AuthorID: "m-kofi"}, {AuthorID: "m-esi"}})
	if len(news) != 1 || news[0].AuthorID != "m-esi" {
		t.Fatalf("blocked author's article leaked: %+v", news)
	}
}
