#!/usr/bin/env bash
# Syncs deps, then starts the PoseTrace dev server (HTTPS, LAN-visible) so you
# can test it on this machine or on a phone.
#   ./start.sh          -> dev server (default)
#   ./start.sh build    -> production build, served with `vite preview`
set -e
cd "$(dirname "$0")"

# `npm install` is a fast no-op when node_modules already matches package.json,
# so always run it rather than trusting a stale directory after a `git pull`.
echo "Syncing dependencies..."
npm install

if [ "${1:-}" = "build" ]; then
  echo "Building the production bundle and serving it..."
  npm run build
  npm run preview
else
  cat <<'EOF'
Starting the PoseTrace dev server...
  - This machine:     https://localhost:5173
  - Same-Wi-Fi phone: use the "Network" URL Vite prints below
  - Accept the self-signed HTTPS certificate warning, then allow camera access
  - iPhone Safari: Share -> Add to Home Screen to install it

Press Ctrl+C to stop.

EOF
  npm run dev
fi
