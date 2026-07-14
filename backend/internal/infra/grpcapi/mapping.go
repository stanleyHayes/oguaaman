// Package grpcapi is the gRPC delivery layer: it adapts the service core to the
// generated oguaa.v1 contract. Like the REST and GraphQL layers, it holds no
// business logic — only request/response translation.
package grpcapi

import (
	"encoding/json"

	"google.golang.org/protobuf/types/known/structpb"

	pb "github.com/oguaa/backend/gen/oguaa/v1"
	"github.com/oguaa/backend/internal/domain"
)

// structFromMap converts a free-form details map into a protobuf Struct. It
// round-trips through JSON first so MongoDB-native types (bson.A, primitive.M,
// numeric types) normalize to the plain JSON kinds structpb accepts.
func structFromMap(m map[string]any) *structpb.Struct {
	if len(m) == 0 {
		return nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	var norm map[string]any
	if err := json.Unmarshal(b, &norm); err != nil {
		return nil
	}
	s, err := structpb.NewStruct(norm)
	if err != nil {
		return nil
	}
	return s
}

func socialLinksToPB(in []domain.SocialLink) []*pb.SocialLink {
	out := make([]*pb.SocialLink, 0, len(in))
	for _, l := range in {
		out = append(out, &pb.SocialLink{Label: l.Label, Url: l.URL})
	}
	return out
}

func tributesToPB(in []domain.Tribute) []*pb.Tribute {
	out := make([]*pb.Tribute, 0, len(in))
	for _, t := range in {
		out = append(out, &pb.Tribute{
			Id: t.ID, AuthorName: t.AuthorName, Relation: t.Relation,
			Message: t.Message, CreatedAt: t.CreatedAt,
		})
	}
	return out
}

func listingToPB(l *domain.Listing) *pb.Listing {
	if l == nil {
		return nil
	}
	return &pb.Listing{
		Id: l.ID, Slug: l.Slug, Type: l.Type, OwnerId: l.OwnerID, Title: l.Title,
		Status: l.Status, Tags: l.Tags, TownId: l.TownID, SchoolIds: l.SchoolIDs,
		PostedByOrgId: l.PostedByOrgID, CoverImageUrl: l.CoverImageURL,
		Details: structFromMap(l.Details), Tributes: tributesToPB(l.Tributes),
		CreatedAt: l.CreatedAt, SubmittedAt: l.SubmittedAt, PublishedAt: l.PublishedAt,
	}
}

func listingsToPB(in []domain.Listing) []*pb.Listing {
	out := make([]*pb.Listing, 0, len(in))
	for i := range in {
		out = append(out, listingToPB(&in[i]))
	}
	return out
}

func memberToPB(m *domain.Member) *pb.Member {
	if m == nil {
		return nil
	}
	return &pb.Member{
		Id: m.ID, Slug: m.Slug, DisplayName: m.DisplayName, Initials: m.Initials,
		PhotoUrl: m.PhotoURL, Bio: m.Bio, TownId: m.TownID, SchoolIds: m.SchoolIDs,
		Links: socialLinksToPB(m.Links), PhoneVerified: m.PhoneVerified,
		Role: m.Role, Suspended: m.Suspended, JoinedAt: m.JoinedAt,
	}
}

func membersToPB(in []domain.Member) []*pb.Member {
	out := make([]*pb.Member, 0, len(in))
	for i := range in {
		out = append(out, memberToPB(&in[i]))
	}
	return out
}

func officesToPB(in []domain.Office) []*pb.Office {
	out := make([]*pb.Office, 0, len(in))
	for _, o := range in {
		out = append(out, &pb.Office{
			Id: o.ID, Role: o.Role, HolderId: o.HolderID,
			HolderName: o.HolderName, Verified: o.Verified,
		})
	}
	return out
}

func orgToPB(o *domain.Organization) *pb.Organization {
	if o == nil {
		return nil
	}
	return &pb.Organization{
		Id: o.ID, Slug: o.Slug, Kind: o.Kind, Name: o.Name, OfficialTitle: o.OfficialTitle,
		Motto: o.Motto, CrestUrl: o.CrestURL, Summary: o.Summary, History: o.History,
		Founded: int32(o.Founded), Classification: o.Classification, Jurisdiction: o.Jurisdiction,
		Contact: socialLinksToPB(o.Contact), Offices: officesToPB(o.Offices),
		RelatedOrgIds: o.RelatedOrgIDs, Verified: o.Verified, VerifiedOn: o.VerifiedOn,
		HouseColors: o.HouseColors, OsaName: o.OSAName, MemberCount: int32(o.MemberCount),
	}
}

func orgsToPB(in []domain.Organization) []*pb.Organization {
	out := make([]*pb.Organization, 0, len(in))
	for i := range in {
		out = append(out, orgToPB(&in[i]))
	}
	return out
}

func placesToPB(in []domain.Place) []*pb.Place {
	out := make([]*pb.Place, 0, len(in))
	for _, p := range in {
		out = append(out, &pb.Place{
			Id: p.ID, Slug: p.Slug, Name: p.Name, ParentId: p.ParentID, Blurb: p.Blurb,
		})
	}
	return out
}
