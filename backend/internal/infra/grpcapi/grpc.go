package grpcapi

import (
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	pb "github.com/oguaa/backend/gen/oguaa/v1"
	"github.com/oguaa/backend/internal/service"
)

// NewGRPCServer builds a *grpc.Server with the Oguaa service registered and
// server reflection enabled (so grpcurl and friends can introspect it).
func NewGRPCServer(svc *service.Service) *grpc.Server {
	srv := grpc.NewServer()
	pb.RegisterOguaaServiceServer(srv, NewServer(svc))
	reflection.Register(srv)
	return srv
}
