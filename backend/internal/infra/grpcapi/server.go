package grpcapi

import (
	"context"
	"errors"
	"log/slog"
	"net"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"

	pb "github.com/oguaa/backend/gen/oguaa/v1"
	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// Server implements the generated OguaaService over the service core.
type Server struct {
	pb.UnimplementedOguaaServiceServer
	svc *service.Service
}

func NewServer(svc *service.Service) *Server { return &Server{svc: svc} }

// grpcErr maps domain errors to gRPC status codes.
func grpcErr(err error) error {
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		return status.Error(codes.NotFound, nf.Error())
	}
	var fb *domain.ForbiddenError
	if errors.As(err, &fb) {
		return status.Error(codes.PermissionDenied, fb.Error())
	}
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		return status.Error(codes.InvalidArgument, ve.Error())
	}
	// Anything else is internal (a database error, a timeout): log it and send a
	// generic message so hostnames and driver details never reach the caller.
	slog.Default().Error("grpc handler error", "err", err)
	return status.Error(codes.Internal, "internal error")
}

// listingsByType resolves the read for a listing type string (spec §8.3).
func (s *Server) listingsByType(ctx context.Context, typ string) ([]domain.Listing, error) {
	switch typ {
	case domain.TypeArtist:
		return s.svc.Artists(ctx)
	case domain.TypePerson:
		return s.svc.People(ctx)
	case domain.TypeMemorial:
		return s.svc.Memorials(ctx)
	case domain.TypeBusiness:
		return s.svc.Businesses(ctx)
	case domain.TypeProperty:
		return s.svc.Properties(ctx)
	case domain.TypeEvent:
		return s.svc.Events(ctx)
	case domain.TypeOpportunity:
		return s.svc.Opportunities(ctx)
	case domain.TypeMemory:
		return s.svc.Memories(ctx)
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unknown listing type %q", typ)
	}
}

func (s *Server) GetStats(ctx context.Context, _ *pb.Empty) (*pb.Stats, error) {
	st, err := s.svc.Stats(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.Stats{
		Members: int32(st.Members), Listings: int32(st.Listings), Schools: int32(st.Schools),
		Institutions: int32(st.Institutions), Artists: int32(st.Artists), Memorials: int32(st.Memorials),
		Memories: int32(st.Memories), Pending: int32(st.Pending),
	}, nil
}

func (s *Server) ListListings(ctx context.Context, req *pb.ListingsRequest) (*pb.ListingsReply, error) {
	items, err := s.listingsByType(ctx, req.GetType())
	if err != nil {
		if _, ok := status.FromError(err); ok {
			return nil, err
		}
		return nil, grpcErr(err)
	}
	return &pb.ListingsReply{Listings: listingsToPB(items)}, nil
}

func (s *Server) GetListing(ctx context.Context, req *pb.SlugRequest) (*pb.ListingReply, error) {
	l, err := s.svc.ListingBySlug(ctx, req.GetType(), req.GetSlug())
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.ListingReply{Listing: listingToPB(l)}, nil
}

func (s *Server) GetSpotlightArtist(ctx context.Context, _ *pb.Empty) (*pb.ListingReply, error) {
	l, err := s.svc.SpotlightArtist(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.ListingReply{Listing: listingToPB(l)}, nil
}

func (s *Server) ListGenres(ctx context.Context, _ *pb.Empty) (*pb.GenresReply, error) {
	g, err := s.svc.Genres(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.GenresReply{Genres: g}, nil
}

func (s *Server) ListMembers(ctx context.Context, _ *pb.Empty) (*pb.MembersReply, error) {
	members, err := s.svc.Members(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.MembersReply{Members: membersToPB(members)}, nil
}

func (s *Server) GetMember(ctx context.Context, req *pb.SlugRequest) (*pb.MemberReply, error) {
	m, err := s.svc.MemberBySlug(ctx, req.GetSlug())
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.MemberReply{Member: memberToPB(m)}, nil
}

func (s *Server) ListInstitutions(ctx context.Context, _ *pb.Empty) (*pb.OrganizationsReply, error) {
	orgs, err := s.svc.Institutions(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.OrganizationsReply{Organizations: orgsToPB(orgs)}, nil
}

func (s *Server) ListSchools(ctx context.Context, _ *pb.Empty) (*pb.OrganizationsReply, error) {
	orgs, err := s.svc.Schools(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.OrganizationsReply{Organizations: orgsToPB(orgs)}, nil
}

func (s *Server) GetInstitution(ctx context.Context, req *pb.SlugRequest) (*pb.OrganizationReply, error) {
	// Revoked/unverified institutions are offline to the public (the REST
	// detail endpoint 404s them for anyone who does not manage the page).
	o, err := s.svc.PublicInstitutionBySlug(ctx, req.GetSlug())
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.OrganizationReply{Organization: orgToPB(o)}, nil
}

func (s *Server) ListPlaces(ctx context.Context, _ *pb.Empty) (*pb.PlacesReply, error) {
	places, err := s.svc.Places(ctx)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.PlacesReply{Places: placesToPB(places)}, nil
}

func (s *Server) LightCandle(ctx context.Context, req *pb.SlugRequest) (*pb.CandleReply, error) {
	visitor := "grpc"
	if p, ok := peer.FromContext(ctx); ok && p.Addr != nil {
		host, _, err := net.SplitHostPort(p.Addr.String())
		if err != nil {
			host = p.Addr.String()
		}
		visitor = "grpc:" + host
	}
	count, err := s.svc.LightCandle(ctx, req.GetSlug(), visitor)
	if err != nil {
		return nil, grpcErr(err)
	}
	return &pb.CandleReply{Candles: int32(count)}, nil
}
