#!/usr/bin/env bash
# Build and push an ARM64 Docker image to GitHub Container Registry.
#
# Prerequisites:
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

echo "==> Building ${FULL_IMAGE} for linux/arm64"

# Ensure the multi-platform builder exists
if ! docker buildx inspect pi-builder &>/dev/null; then
  docker buildx create --name pi-builder --driver docker-container --bootstrap
fi

docker buildx build \
  --builder pi-builder \
  --platform linux/arm64 \
  --file sync-server.Dockerfile \
  --tag "${FULL_IMAGE}" \
  --push \
  .

echo ""
echo "==> Done. Image pushed: ${FULL_IMAGE}"
echo ""
echo "To deploy on your Pi:"
echo "  ssh pi 'cd ~/actual && docker compose -f docker-compose.pi.yml pull && docker compose -f docker-compose.pi.yml up -d'"
