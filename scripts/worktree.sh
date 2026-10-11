#!/usr/bin/env bash
# Parallel agent worktrees that share one local Supabase stack.
#   npm run wt -- new <name>   create ../<repo>-<name> on branch <name>, then set it up
#   npm run wt -- setup        (inside a worktree) install deps, write a local-only .env.local
#   npm run wt -- env          print env vars for the running local Supabase stack (CI, cloud agent)
#   npm run wt -- rm <name>    remove the worktree (branch is kept)
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

claimed_ports() {
  git worktree list --porcelain | sed -n 's/^worktree //p' | while read -r dir; do
    sed -n 's/^PORT=//p' "$dir/.env.local" 2>/dev/null || true
  done
}

free_port() {
  local claimed
  claimed=$(claimed_ports)
  for port in $(seq 3100 3199); do
    if ! grep -qx "$port" <<<"$claimed" && ! lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$port"
      return
    fi
  done
  echo "No free port in 3100-3199" >&2
  exit 1
}

local_env() {
  eval "$(npx supabase status -o env 2>/dev/null)"
  # Seeded local accounts only (supabase/seed.sql); never hosted credentials.
  cat <<EOF
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=$SECRET_KEY
SUPABASE_URL=$API_URL
E2E_DB_URL=$DB_URL
E2E_TEST_ADMIN_PASSWORD=ssl-test-password
E2E_TEST_TECH_PASSWORD=ssl-test-password
E2E_TEST_VOLUNTEER_PASSWORD=ssl-test-password
E2E_TEST_VIEWER_PASSWORD=ssl-test-password
EOF
}

setup() {
  cd "$repo_root"
  if [[ "$repo_root" == "$main_root" ]]; then
    echo "Run setup inside a worktree; the main checkout keeps its own .env.local." >&2
    exit 1
  fi
  npm ci --no-audit --no-fund
  # Pin the same local service images as the main checkout; mixed storage-api versions corrupt the shared stack.
  mkdir -p supabase/.temp
  cp "$main_root"/supabase/.temp/*-version "$main_root"/supabase/.temp/storage-migration supabase/.temp/ 2>/dev/null || true
  npx supabase status >/dev/null 2>&1 || npx supabase start
  local port env
  port=$(sed -n 's/^PORT=//p' .env.local 2>/dev/null || true)
  port=${port:-$(free_port)}
  env=$(local_env)
  printf 'PORT=%s\nE2E_RESET_DB=1\n%s\n' "$port" "$env" >.env.local
  echo "Ready. Dev server: npm run dev -- -p $port   E2E: npx playwright test <section>"
}

case "${1:-}" in
  new)
    name=${2:?usage: npm run wt -- new <name>}
    dir="$(dirname "$main_root")/$(basename "$main_root")-$name"
    git -C "$main_root" worktree add "$dir" -b "$name"
    (cd "$dir" && bash scripts/worktree.sh setup)
    echo "Worktree: $dir"
    ;;
  setup) setup ;;
  env) local_env ;;
  rm)
    name=${2:?usage: npm run wt -- rm <name>}
    git -C "$main_root" worktree remove "$(dirname "$main_root")/$(basename "$main_root")-$name"
    ;;
  *)
    sed -n '2,6p' "$0"
    exit 1
    ;;
esac
