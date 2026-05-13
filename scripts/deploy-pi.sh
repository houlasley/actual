#!/usr/bin/env bash
# Build, push, and deploy to Raspberry Pi in one step.
#
# Usage:
#   PI_HOST=pi@raspberrypi.local ./scripts/deploy-pi.sh [tag]
#
# Or set PI_HOST in your shell profile:
#   export PI_HOST=pi@192.168.1.x

set -euo pipefail

PI_HOST="${PI_HOST:-pi@raspberrypi.local}"
PI_DIR="${PI_DIR:-~/actual}"
TAG="${1:-latest}"

# Build and push the image
"$(dirname "$0")/build-pi-image.sh" "${TAG}"

echo "==> Deploying to ${PI_HOST}:${PI_DIR}"
ssh "${PI_HOST}" "
  set -e
  cd ${PI_DIR}
  docker compose -f docker-compose.pi.yml pull
  docker compose -f docker-compose.pi.yml up -d
  docker image prune -f
"
echo "==> Deploy complete. Actual is running on ${PI_HOST}:5006"
