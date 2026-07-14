# Oguaa — common commands. `make up` (Docker) or `make dev` (local).

.PHONY: help up down logs dev seed test build lint proto tidy ci

help:
	@echo "Oguaa:"
	@echo "  make up     - Docker: build & start everything (marketing:3003 web:3000 admin:3001 mobile:3002 api:8080)"
	@echo "  make down   - Docker: stop & remove containers"
	@echo "  make logs   - Docker: tail logs"
	@echo "  make dev    - Local: start backend + web + admin (needs local mongod, go, pnpm)"
	@echo "  make seed   - Reseed MongoDB with the Cape Coast data"
	@echo "  make proto  - Regenerate gRPC code from proto/ (needs buf)"
	@echo "  make lint   - Lint Go (vet), proto (buf), and the web/admin apps (eslint)"
	@echo "  make test   - Run Go tests"
	@echo "  make build  - Build backend + web + admin"
	@echo "  make ci     - lint + test + build (what CI runs)"
	@echo ""
	@echo "  API surfaces: REST http://localhost:8080/api  |  GraphQL :8080/graphql  |  gRPC :9090"

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

dev:
	./dev.sh

seed:
	cd backend && go run ./cmd/seed

proto:
	cd backend && buf lint && buf generate

tidy:
	cd backend && go mod tidy

lint:
	cd backend && go vet ./... && buf lint
	cd frontend && pnpm lint
	cd admin && pnpm lint
	cd marketing && pnpm lint

test:
	cd backend && go test ./...

build:
	cd backend && go build ./...
	cd frontend && pnpm build
	cd admin && pnpm build
	cd marketing && pnpm build

ci: lint test build
