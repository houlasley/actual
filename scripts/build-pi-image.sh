#!/usr/bin/env bash
# Build and push an ARM64 Docker image to GitHub Container Registry.
#
# Mirrors the upstream CI approach: yarn build:server runs on the host first,
# then the lean alpine Dockerfile packages the output into the image.
# This avoids running the full JS build inside Docker (slow, memory-heavy).
#
# Prerequisites:
#   - Node.js >=22 and Yarn ^4.9.1
#   - Docker with buildx and the containerd image store enabled
#   - Authenticated to ghcr.io:
#       echo $GITHUB_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin
#
# Usage:
#   ./scripts/build-pi-image.sh [tag]      # default tag: latest
#
# After pushing, run on the Pi:
#   docker compose -f docker-compose.pi.yml pull
#   docker compose -f docker-compose.pi.yml up -d

set -euo pipefail

GITHUB_USERNAME="${GITHUB_USERNAME:-houlasley}"
IMAGE="ghcr.io/${GITHUB_USERNAME}/actual-server"
TAG="${1:-latest}"
FULL_IMAGE="${IMAGE}:${TAG}"

echo "==> Building JS/TS (yarn build:server)"
yarn build:server

echo "==> Building Docker image ${FULL_IMAGE} for linux/arm64"

# Ensure the multi-platform builder exists
if ! docker buildx inspect pi-builder &>/dev/null; then
  docker buildx create --name pi-builder --driver docker-container --bootstrap
fi

docker buildx build \
  --builder pi-builder \
  --platform linux/arm64 \
  --file packages/sync-server/docker/alpine.Dockerfile \
  --tag "${FULL_IMAGE}" \
  --push \
  .

echo ""
echo "==> Done. Image pushed: ${FULL_IMAGE}"
echo ""
echo "To deploy on your Pi:"
echo "  ssh pi 'cd ~/actual && docker compose -f docker-compose.pi.yml pull && docker compose -f docker-compose.pi.yml up -d'"
