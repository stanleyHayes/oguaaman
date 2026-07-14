#!/usr/bin/env bash
# Oguaa — one command to run the whole stack locally (no Docker).
# Needs: Go, Node + pnpm, and a local MongoDB on :27017.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▸ Stopping anything on :8080 :50051 :5173 :5174 :5175…"
lsof -ti :8080 :50051 :5173 :5174 :5175 2>/dev/null | xargs kill -9 2>/dev/null || true

if ! nc -z localhost 27017 2>/dev/null; then
  echo "✗ MongoDB is not reachable on localhost:27017."
  echo "  Start it first (e.g. 'brew services start mongodb-community') and re-run, or use Docker: make up"
  exit 1
fi

echo "▸ Seeding MongoDB (fact-checked Cape Coast data)…"
( cd "$ROOT/backend" && go run ./cmd/seed )

echo "▸ Starting backend (:8080), public web (:5173), admin (:5174), marketing (:5175)…"
( cd "$ROOT/backend"   && go run ./cmd/server ) &
( cd "$ROOT/frontend"  && pnpm dev --port 5173 --host ) &
( cd "$ROOT/admin"     && pnpm dev --port 5174 --host ) &
( cd "$ROOT/marketing" && pnpm dev --port 5175 --host ) &

trap 'echo; echo "Stopping Oguaa…"; jobs -p | xargs kill 2>/dev/null || true' EXIT INT TERM

cat <<'EOF'

  ┌──────────────────────────────────────────────────────────────┐
  │  Oguaa is running                                              │
  │    Marketing site  http://localhost:5175                       │
  │    Public web app  http://localhost:5173                       │
  │    Admin platform  http://localhost:5174                       │
  │    REST API        http://localhost:8080/api/health            │
  │    GraphQL         http://localhost:8080/graphql  (playground) │
  │    gRPC            localhost:50051  (reflection on)            │
  │    Mobile (Expo)   cd mobile && pnpm start                     │
  │                                                                │
  │    Sign in (dev OTP shown on screen):                          │
  │      curator/steward → nana-essien@oguaa.test (admin)          │
  │      member          → ama-mensah@oguaa.test                   │
  └──────────────────────────────────────────────────────────────┘
  Ctrl+C to stop everything.
EOF

wait
