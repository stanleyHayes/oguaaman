package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeReviews is an in-memory ReviewRepository. Upsert is keyed by
// listingID+memberID so a member editing their review replaces it.
type fakeReviews struct {
	rows []domain.Review
}

func (r *fakeReviews) ByListing(_ context.Context, listingID string) ([]domain.Review, error) {
	out := []domain.Review{}
	for _, rev := range r.rows {
		if rev.ListingID == listingID {
			out = append(out, rev)
		}
	}
	return out, nil
}

// Upsert mirrors the Mongo repo: an edit keeps the review's id, creation time
// and moderation status and only updates the content fields.
func (r *fakeReviews) Upsert(_ context.Context, rev domain.Review) error {
	for i := range r.rows {
		if r.rows[i].ListingID == rev.ListingID && rev.MemberID != "" && r.rows[i].MemberID == rev.MemberID {
			cur := &r.rows[i]
			cur.ListingSlug, cur.MemberSlug, cur.AuthorName = rev.ListingSlug, rev.MemberSlug, rev.AuthorName
			cur.Rating, cur.Body, cur.UpdatedAt = rev.Rating, rev.Body, rev.UpdatedAt
			return nil
		}
	}
	r.rows = append(r.rows, rev)
	return nil
}

func (r *fakeReviews) Get(_ context.Context, id string) (*domain.Review, error) {
	for i := range r.rows {
		if r.rows[i].ID == id {
			rv := r.rows[i]
			return &rv, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "review"}
}

func (r *fakeReviews) SetStatus(_ context.Context, id, status string) error {
	for i := range r.rows {
		if r.rows[i].ID == id {
			r.rows[i].Status = status
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "review"}
}

func (r *fakeReviews) HasReviewed(_ context.Context, listingID, memberID string) (bool, error) {
	for _, rev := range r.rows {
		if rev.ListingID == listingID && rev.MemberID == memberID {
			return true, nil
		}
	}
	return false, nil
}

func reviewTestService() (*Service, *fakeRepo, *fakeReviews) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "b-1", Slug: "auntie-akos-kitchen", Type: domain.TypeBusiness, Status: domain.StatusApproved, OwnerID: "m-owner", Title: "Auntie Ako's Kitchen", Details: map[string]any{}},
	}}
	fr := &fakeReviews{}
	svc := New(Deps{Listings: f, Members: stubMembers{}, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}, Reviews: fr})
	return svc, f, fr
}

func TestAddBusinessReview_storesAndAggregates(t *testing.T) {
	svc, f, _ := reviewTestService()
	kojo := &domain.Member{ID: "m-kojo", DisplayName: "Kojo Mensah", Role: domain.RoleMember}
	ama := &domain.Member{ID: "m-ama", DisplayName: "Ama Serwaa", Role: domain.RoleMember}

	if _, err := svc.AddBusinessReview(context.Background(), kojo, "auntie-akos-kitchen", ReviewInput{Rating: 5, Body: "Best waakye in Cape Coast."}); err != nil {
		t.Fatalf("first review failed: %v", err)
	}
	if _, err := svc.AddBusinessReview(context.Background(), ama, "auntie-akos-kitchen", ReviewInput{Rating: 4}); err != nil {
		t.Fatalf("second review failed: %v", err)
	}

	_, avg, count, err := svc.BusinessReviews(context.Background(), "auntie-akos-kitchen")
	if err != nil {
		t.Fatalf("BusinessReviews: %v", err)
	}
	if count != 2 || avg != 4.5 {
		t.Fatalf("aggregate = %.2f avg / %d count, want 4.50 / 2", avg, count)
	}
	// The aggregate is mirrored onto the listing for cheap directory reads.
	if got := f.listings[0].Details["ratingCount"]; got != 2 {
		t.Errorf("details.ratingCount = %v, want 2", got)
	}
	if got := f.listings[0].Details["ratingAvg"]; got != 4.5 {
		t.Errorf("details.ratingAvg = %v, want 4.5", got)
	}
}

func TestAddBusinessReview_oneReviewPerMemberReplaces(t *testing.T) {
	svc, _, fr := reviewTestService()
	kojo := &domain.Member{ID: "m-kojo", DisplayName: "Kojo", Role: domain.RoleMember}

	if _, err := svc.AddBusinessReview(context.Background(), kojo, "auntie-akos-kitchen", ReviewInput{Rating: 2}); err != nil {
		t.Fatalf("first review failed: %v", err)
	}
	if _, err := svc.AddBusinessReview(context.Background(), kojo, "auntie-akos-kitchen", ReviewInput{Rating: 5, Body: "Came back — much better."}); err != nil {
		t.Fatalf("edit review failed: %v", err)
	}
	if len(fr.rows) != 1 {
		t.Fatalf("a member's second review must replace the first, got %d rows", len(fr.rows))
	}
	if fr.rows[0].Rating != 5 {
		t.Errorf("rating = %d, want the edited 5", fr.rows[0].Rating)
	}
}

func TestAddBusinessReview_rejectsOwnerAndBadRating(t *testing.T) {
	svc, _, _ := reviewTestService()
	owner := &domain.Member{ID: "m-owner", Role: domain.RoleMember}
	stranger := &domain.Member{ID: "m-x", Role: domain.RoleMember}

	var fb *domain.ForbiddenError
	err := errFrom(svc.AddBusinessReview(context.Background(), owner, "auntie-akos-kitchen", ReviewInput{Rating: 5}))
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("owner reviewing own business: got %v, want ForbiddenError", err)
	}

	if err := errFrom(svc.AddBusinessReview(context.Background(), stranger, "auntie-akos-kitchen", ReviewInput{Rating: 0})); err == nil {
		t.Error("expected an error for a 0-star rating")
	}
	if err := errFrom(svc.AddBusinessReview(context.Background(), stranger, "auntie-akos-kitchen", ReviewInput{Rating: 6})); err == nil {
		t.Error("expected an error for a 6-star rating")
	}
}

// errFrom drops the first return value of AddBusinessReview so tests can assert
// on the error alone.
func errFrom(_ *domain.Review, err error) error { return err }

// F094: an edit answers with the stored review's id; hidden reviews are
// neither shown nor counted; the content screen refuses abusive reviews.
func TestAddBusinessReview_editKeepsIDAndHiddenNotCounted(t *testing.T) {
	svc, _, fr := reviewTestService()
	ctx := context.Background()
	kojo := &domain.Member{ID: "m-kojo", DisplayName: "Kojo", Role: domain.RoleMember}
	first, err := svc.AddBusinessReview(ctx, kojo, "auntie-akos-kitchen", ReviewInput{Rating: 2})
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	edited, err := svc.AddBusinessReview(ctx, kojo, "auntie-akos-kitchen", ReviewInput{Rating: 4})
	if err != nil || edited.ID != first.ID {
		t.Fatalf("edit must keep id %q, got %+v (%v)", first.ID, edited, err)
	}
	_ = fr.SetStatus(ctx, first.ID, domain.ReviewHidden)
	reviews, _, count, err := svc.BusinessReviews(ctx, "auntie-akos-kitchen")
	if err != nil || len(reviews) != 0 || count != 0 {
		t.Fatalf("hidden review leaked: %v count %d (%v)", reviews, count, err)
	}
	if _, err := svc.AddBusinessReview(ctx, &domain.Member{ID: "m-x"}, "auntie-akos-kitchen", ReviewInput{Rating: 1, Body: "I will kill you"}); err == nil {
		t.Fatal("a threatening review must be refused")
	}
}
