package mongo

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// storedListing returns a memorial as Mongo stores it (through the same bson
// tags ListingRepo.AddTribute writes), decoded into a plain map.
func storedListing(t *testing.T, l domain.Listing) bson.M {
	t.Helper()
	raw, err := bson.Marshal(l)
	if err != nil {
		t.Fatal(err)
	}
	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return doc
}

// arrayElems returns the embedded array at field as a list of documents.
func arrayElems(t *testing.T, doc bson.M, field string) []bson.M {
	t.Helper()
	arr, ok := doc[field].(bson.A)
	if !ok {
		t.Fatalf("stored listing has no array at %q (keys: %v)", field, doc)
	}
	out := make([]bson.M, 0, len(arr))
	for _, e := range arr {
		d, ok := e.(bson.D)
		if !ok {
			t.Fatalf("element of %q is %T, want a document", field, e)
		}
		m := bson.M{}
		for _, kv := range d {
			m[kv.Key] = kv.Value
		}
		out = append(out, m)
	}
	return out
}

// R06: the tribute erasure must target the path tributes are actually stored
// at. It used to update details.tributes, which nothing writes, so an erased
// member's name stayed on every tribute they left.
func TestTributeAuthorErasureTargetsStoredPath(t *testing.T) {
	doc := storedListing(t, domain.Listing{ID: "mem-1", Tributes: []domain.Tribute{
		{ID: "t1", AuthorName: "Ama Owusu", MemberID: "m1", MemberSlug: "ama-owusu-123456"},
	}})
	filter, update, arrayFilters := tributeAuthorErasure("m1")

	for key := range filter {
		field, sub, _ := strings.Cut(key, ".")
		elems := arrayElems(t, doc, field)
		if elems[0][sub] != "m1" {
			t.Errorf("filter %q does not match the stored tribute %v", key, elems[0])
		}
	}
	for op, fields := range update {
		for key := range fields.(bson.M) {
			field, rest, _ := strings.Cut(key, ".$[t].")
			elems := arrayElems(t, doc, field)
			if _, ok := elems[0][rest]; !ok {
				t.Errorf("%s %q names a field the stored tribute does not have: %v", op, key, elems[0])
			}
		}
	}
	if len(arrayFilters) != 1 || arrayFilters[0].(bson.M)["t.memberId"] != "m1" {
		t.Errorf("arrayFilters = %v, want only the member's own tributes", arrayFilters)
	}
	if update[opSet].(bson.M)["tributes.$[t].authorName"] != formerMember {
		t.Errorf("tribute author is not renamed to %q: %v", formerMember, update)
	}
}

// R14: the public slug is derived from the member's name, so an erased
// author's reviews and tributes lose it along with the member id.
func TestAuthorErasureRemovesNameDerivedSlug(t *testing.T) {
	_, tribute, _ := tributeAuthorErasure("m1")
	cases := map[string]struct {
		update bson.M
		prefix string
	}{
		"review":  {authorErasure(""), ""},
		"tribute": {tribute, "tributes.$[t]."},
	}
	for name, c := range cases {
		unset := c.update[opUnset].(bson.M)
		for _, f := range []string{"memberId", "memberSlug"} {
			if _, ok := unset[c.prefix+f]; !ok {
				t.Errorf("%s erasure keeps %s: %v", name, f, c.update)
			}
		}
		if c.update[opSet].(bson.M)[c.prefix+"authorName"] != formerMember {
			t.Errorf("%s author not renamed: %v", name, c.update)
		}
	}
	// Both fields exist on the stored documents under those names.
	review, err := bson.Marshal(domain.Review{MemberID: "m1", MemberSlug: "kwame-mensah-482913"})
	if err != nil {
		t.Fatal(err)
	}
	var doc bson.M
	if err := bson.Unmarshal(review, &doc); err != nil {
		t.Fatal(err)
	}
	if doc["memberSlug"] != "kwame-mensah-482913" || doc["memberId"] != "m1" {
		t.Errorf("stored review keys changed: %v", doc)
	}
}

// R29: the tombstone that replaces an erased member carries a token version
// past every one issued, so no earlier session token ever matches it.
func TestErasedMemberTombstoneRevokesEverySession(t *testing.T) {
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	for _, old := range []int{0, 1, 7} {
		doc := erasedMemberTombstone("usr-kwame-mensah-482913", old, now)
		if doc[memberTokenVersion] != old+1 {
			t.Errorf("old version %d: tombstone tokenVersion = %v, want %d", old, doc[memberTokenVersion], old+1)
		}
		if doc["suspended"] != true || doc["erasedAt"] == "" {
			t.Errorf("tombstone is not locked and marked erased: %v", doc)
		}
		if strings.Contains(doc["slug"].(string), "kwame") {
			t.Errorf("tombstone slug carries the name: %v", doc["slug"])
		}
	}
	// A never-bumped member has no tokenVersion field; the guard must match it.
	in, ok := tokenVersionIs("m1", 0)[memberTokenVersion].(bson.M)
	if !ok || len(in["$in"].(bson.A)) != 2 {
		t.Errorf("version-0 guard does not match an absent field: %v", tokenVersionIs("m1", 0))
	}
}

// R28: only the member's own tributes are exported from each memorial.
func TestTributesByPicksOnlyTheMembersTributes(t *testing.T) {
	got := tributesBy([]domain.Listing{{ID: "l1", Slug: "nana", Title: "Nana", Tributes: []domain.Tribute{
		{ID: "t1", MemberID: "m1"}, {ID: "t2", MemberID: "m2"}, {ID: "t3", MemberID: "m1"},
	}}}, "m1")
	if len(got) != 2 || got[0].Tribute.ID != "t1" || got[1].Tribute.ID != "t3" || got[0].MemorialSlug != "nana" {
		t.Errorf("tributesBy = %+v, want t1 and t3 on nana", got)
	}
	if empty := tributesBy(nil, "m1"); empty == nil {
		t.Error("no tributes should export as an empty list, not null")
	}
}

// R16: uploads can sit anywhere in a kept document — a cover, a gallery, a
// section block, a storefront product, free-form listing details, or inline
// in a Markdown body — so the scan reads every string at every depth, and
// matches only the erased member's files.
func TestCollectMediaRefsFindsUploadsAtAnyDepth(t *testing.T) {
	const (
		folder = "oguaa/m/abc123/"
		cdn    = "https://res.cloudinary.com/demo/image/upload/v1/"
	)
	needles := []string{"/uploads/own.jpg", folder}
	inline := "Our new hall ![hall](" + cdn + folder + "hall.jpg) opened today."
	listing := domain.Listing{
		ID: "l1", CoverImageURL: cdn + folder + "cover.jpg",
		Photos:   []domain.MediaAsset{{URL: "https://api.oguaaman.com/uploads/own.jpg"}, {URL: cdn + "oguaa/m/other/x.jpg"}},
		Sections: []domain.ProfileSection{{ID: "s1", Body: inline, Items: []domain.SectionItem{{Image: cdn + folder + "team.jpg"}}}},
		Products: []domain.StoreItem{{ID: "p1", ImageURL: cdn + folder + "kente.jpg"}},
		Details:  map[string]any{"gallery": []any{map[string]any{"src": "/uploads/own.jpg?w=400"}}, "note": "/uploads/someone-elses.jpg"},
	}
	org := domain.Organization{ID: "o1", CrestURL: cdn + folder + "crest.png",
		Gallery: []domain.MediaAsset{{URL: cdn + "oguaa/m/other/y.jpg"}}}
	refs := map[string]bool{}
	for _, doc := range []any{listing, org} {
		raw, err := bson.Marshal(doc)
		if err != nil {
			t.Fatal(err)
		}
		if err := collectMediaRefs(raw, needles, refs); err != nil {
			t.Fatal(err)
		}
	}
	want := []string{
		cdn + folder + "cover.jpg", "https://api.oguaaman.com/uploads/own.jpg", inline, cdn + folder + "team.jpg",
		cdn + folder + "kente.jpg", "/uploads/own.jpg?w=400", cdn + folder + "crest.png",
	}
	for _, w := range want {
		if !refs[w] {
			t.Errorf("missed %q", w)
		}
	}
	if len(refs) != len(want) {
		t.Errorf("refs = %v, want exactly %v (other members' files are not the erased member's)", refs, want)
	}
}

// R16: the scan covers every listing, article and institution page except
// exactly what the erasure takes down itself — the member's own listings and
// unpublished drafts — never only the member's own content: stewards edit
// every institution page and editors every article.
func TestRetainedMediaSourcesSkipOnlyWhatErasureTakesDown(t *testing.T) {
	got := map[string]bson.M{}
	for _, src := range retainedMediaSources("m1") {
		got[src.coll] = src.filter
	}
	want := map[string]bson.M{
		collListings: {opNor: bson.A{ownListings("m1")}},
		collNews:     {opNor: bson.A{unpublishedNewsBy("m1")}},
		collOrgs:     {},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("sources = %v, want %v", got, want)
	}
}

// storedDoc returns v as Mongo stores it, decoded into a plain map.
func storedDoc(t *testing.T, v any) bson.M {
	t.Helper()
	raw, err := bson.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	return doc
}

// lookup follows a dotted path through a stored document, whose embedded
// documents decode as bson.D.
func lookup(doc any, path string) any {
	cur := doc
	for _, key := range strings.Split(path, ".") {
		switch d := cur.(type) {
		case bson.M:
			cur = d[key]
		case bson.D:
			cur = nil
			for _, e := range d {
				if e.Key == key {
					cur = e.Value
				}
			}
		default:
			return nil
		}
	}
	return cur
}

// R15: every kept reference names a field the stored record really has —
// written through the same domain types (and, for listing details, the same
// keys) the services use — so the erasure moves the id that is actually there.
func TestKeptMemberRefsNameStoredFields(t *testing.T) {
	const old = "usr-kwame-mensah-482913"
	samples := map[string]any{
		collTickets:               domain.Ticket{MemberID: old},
		collPledges:               domain.Pledge{MemberID: old},
		collSubscriptions:         domain.Subscription{MemberID: old},
		collPromotions:            domain.Promotion{MemberID: old},
		collStripeIntents:         domain.StripeIntent{MemberID: old},
		collAgentJobs:             domain.AgentJob{ClientMemberID: old, AgentMemberID: old},
		collAgents:                domain.Agent{MemberID: old, VerifiedByID: old},
		collBusinessVerifications: domain.BusinessVerification{OwnerID: old, ReviewedByID: old},
		collArtistBookings:        domain.ArtistBooking{ArtistOwnerID: old},
		collListings: domain.Listing{OwnerID: old, ReviewedByID: old, Details: map[string]any{
			"postReviewedBy": old, "statusHistory": []any{map[string]any{"status": "reported", "by": old}},
		}},
		collNews: domain.NewsArticle{AuthorID: old},
		collReports: domain.Report{TargetType: domain.ReportTargetMember, TargetID: old, TargetOwnerID: old,
			ReviewedByID: old},
		collModeration:      domain.ModerationRecord{ModeratorID: old, TargetType: domain.ReportTargetMember, TargetID: old},
		collOrgClaims:       domain.OrgClaim{InvitedByID: old, ReviewedByID: old},
		collDirectives:      domain.Directive{CreatedByID: old},
		collGoals:           domain.Goal{CreatedByID: old, ReviewedByID: old},
		collPrivacyRequests: domain.PrivacyRequest{MemberID: old, History: []domain.PrivacyRequestEvent{{ActorID: old}}},
	}
	for _, ref := range keptMemberRefs {
		sample, ok := samples[ref.coll]
		if !ok {
			t.Errorf("%s.%s: no stored sample — add one to check the field path", ref.coll, ref.field)
			continue
		}
		doc := storedDoc(t, sample)
		for k, v := range ref.where {
			if doc[k] != v {
				t.Errorf("%s: where %s=%v does not match the stored record (%v)", ref.coll, k, v, doc[k])
			}
		}
		got, path := lookup(doc, ref.field), ref.field
		if ref.elem != "" {
			path = ref.elem + "[]." + ref.field
			arr, _ := lookup(doc, ref.elem).(bson.A)
			if len(arr) == 0 {
				t.Errorf("%s: no array stored at %s", ref.coll, ref.elem)
				continue
			}
			got = lookup(arr[0], ref.field)
		}
		if got != old {
			t.Errorf("%s: %s = %v, want the member id stored there", ref.coll, path, got)
		}
	}
}

// R15: each update moves only the erased member's id, inside arrays only the
// matching elements, and only on records whose field holds a member id.
func TestReassignMovesOnlyTheErasedMembersID(t *testing.T) {
	plain := memberRef{coll: collTickets, field: fMemberID}
	filter, update, _ := plain.reassign("usr-old", "erased-new")
	if !reflect.DeepEqual(filter, bson.M{fMemberID: "usr-old"}) ||
		!reflect.DeepEqual(update, bson.M{opSet: bson.M{fMemberID: "erased-new"}}) {
		t.Errorf("plain reassign = %v / %v", filter, update)
	}
	inArray := memberRef{coll: collPrivacyRequests, elem: "history", field: "actorId"}
	filter, update, opts := inArray.reassign("usr-old", "erased-new")
	if !reflect.DeepEqual(filter, bson.M{"history.actorId": "usr-old"}) ||
		!reflect.DeepEqual(update, bson.M{opSet: bson.M{"history.$[e].actorId": "erased-new"}}) {
		t.Errorf("array reassign = %v / %v", filter, update)
	}
	var set options.UpdateManyOptions
	for _, apply := range opts.List() {
		if err := apply(&set); err != nil {
			t.Fatal(err)
		}
	}
	if !reflect.DeepEqual(set.ArrayFilters, []any{bson.M{"e.actorId": "usr-old"}}) {
		t.Errorf("array filters = %v, want only the erased member's entries", set.ArrayFilters)
	}
	scoped := memberRef{coll: collReports, field: fTargetID, where: memberTarget}
	filter, _, _ = scoped.reassign("usr-old", "erased-new")
	if filter["targetType"] != domain.ReportTargetMember || filter[fTargetID] != "usr-old" {
		t.Errorf("scoped reassign filter = %v, want member targets only", filter)
	}
	// The where map is shared by several refs and must never be written to.
	if len(memberTarget) != 1 {
		t.Errorf("memberTarget was modified: %v", memberTarget)
	}
}

// R15: the tombstone's erasure id is its own id, so erasing it again keeps it
// where it is, and nothing on it derives from the original id.
func TestTombstoneLivesUnderItsOwnErasureID(t *testing.T) {
	doc := erasedMemberTombstone("erased-0123456789abcdef", 2, time.Now())
	if doc["_id"] != "erased-0123456789abcdef" || doc[memberErasureID] != "erased-0123456789abcdef" {
		t.Errorf("tombstone = %v, want _id and erasureId both the tombstone id", doc)
	}
}
