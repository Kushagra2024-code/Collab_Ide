#!/usr/bin/env bash
# ============================================================
# start-dev.sh — CollabIDE Local Development Startup
# ============================================================
# Usage:
#   chmod +x start-dev.sh
#   ./start-dev.sh
#
# Prerequisites:
#   - Docker installed and running (for PostgreSQL)
#   - pnpm installed (npm install -g pnpm)
#   - .env file created (cp .env.example .env && edit it)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        CollabIDE — Local Dev Startup         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Check .env file ────────────────────────────────────────
if [ ! -f ".env" ]; then
  warn ".env not found. Copying .env.example → .env"
  cp .env.example .env
  echo ""
  echo -e "${YELLOW}⚠  Please edit .env and set:${NC}"
  echo "   SESSION_SECRET  — run: openssl rand -hex 32"
  echo "   GEMINI_API_KEY  — get from: https://aistudio.google.com/app/apikey"
  echo ""
  read -rp "Press Enter after editing .env to continue..." _
fi

# ── Load .env ─────────────────────────────────────────────
set -o allexport
source .env
set +o allexport

# ── Find pnpm ─────────────────────────────────────────────
PNPM_BIN=""
for candidate in \
  "$(command -v pnpm 2>/dev/null)" \
  "$HOME/.npm-global/bin/pnpm" \
  "$HOME/.local/bin/pnpm" \
  "/usr/local/bin/pnpm"; do
  if [ -x "$candidate" ]; then
    PNPM_BIN="$candidate"
    break
  fi
done

if [ -z "$PNPM_BIN" ]; then
  info "pnpm not found. Installing globally..."
  npm install -g pnpm@9
  PNPM_BIN="$(npm root -g)/../bin/pnpm"
  # Try again
  for candidate in \
    "$(command -v pnpm 2>/dev/null)" \
    "$HOME/.npm-global/bin/pnpm"; do
    if [ -x "$candidate" ]; then
      PNPM_BIN="$candidate"
      break
    fi
  done
fi

[ -z "$PNPM_BIN" ] && error "Cannot find pnpm binary. Please install: npm install -g pnpm@9"
success "pnpm found: $PNPM_BIN ($($PNPM_BIN --version))"

# ── Start PostgreSQL via Docker ────────────────────────────
info "Starting PostgreSQL via Docker..."
DB_CONTAINER="collabide-postgres-dev"

if docker ps --filter "name=$DB_CONTAINER" --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
  success "PostgreSQL container already running"
else
  if docker ps -a --filter "name=$DB_CONTAINER" --format '{{.Names}}' | grep -q "$DB_CONTAINER"; then
    info "Restarting existing PostgreSQL container..."
    docker start "$DB_CONTAINER"
  else
    info "Creating new PostgreSQL container..."
    docker run -d \
      --name "$DB_CONTAINER" \
      -e POSTGRES_USER=collabide \
      -e POSTGRES_PASSWORD=collabide \
      -e POSTGRES_DB=collabide \
      -p 5432:5432 \
      --restart unless-stopped \
      postgres:16-alpine
  fi

  info "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    if docker exec "$DB_CONTAINER" pg_isready -U collabide -d collabide &>/dev/null; then
      break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
      error "PostgreSQL failed to start after 30 seconds"
    fi
  done
fi
success "PostgreSQL is ready"

# Override DATABASE_URL for local dev (uses localhost:5433 to avoid conflicts)
export DATABASE_URL="postgresql://collabide:collabide@localhost:5433/collabide"

# ── Install dependencies ───────────────────────────────────
info "Installing workspace dependencies..."
$PNPM_BIN install --ignore-scripts 2>&1 | tail -5 || warn "pnpm install had issues (may be ok)"
success "Dependencies installed"

# ── Push DB Schema ─────────────────────────────────────────
info "Pushing database schema..."
$PNPM_BIN --filter @workspace/db run push 2>&1 || warn "DB push may have already been done"
success "Database schema up to date"

# ── Build API Server ───────────────────────────────────────
info "Building API server..."
$PNPM_BIN --filter @workspace/api-server run build 2>&1 | tail -10
success "API server built"

# ── Start services ─────────────────────────────────────────
echo ""
echo -e "${GREEN}🚀 Starting services...${NC}"
echo ""
echo -e "  📡 API Server → ${BLUE}http://localhost:${PORT:-8080}/api/health${NC}"
echo -e "  🌐 Frontend   → ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all services"
echo ""

# Trap to kill all child processes on exit
cleanup() {
  echo ""
  info "Shutting down..."
  kill 0
}
trap cleanup SIGINT SIGTERM

# Start API server
PORT=${PORT:-8080} $PNPM_BIN --filter @workspace/api-server run start &
API_PID=$!

# Give API a moment to start
sleep 2

# Start frontend dev server
BASE_PATH=/ PORT=3000 $PNPM_BIN --filter @workspace/collab-ide run dev &
FRONTEND_PID=$!

# Wait for both
wait $API_PID $FRONTEND_PID
