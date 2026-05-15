#!/usr/bin/env bash
# Build and push an ARM64 Docker image to GitHub Container Registry.
#
# Everything runs inside Docker — no local Node.js or yarn needed.
# Requires only Docker with buildx on the host machine.
#
# Prerequisites:
#   - Docker with buildx and the containerd image store enabled
#   - Authenticated to ghcr.io:
#       echo $GITHUB_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin
#
# Usage:
#   ./scripts/build-pi-image.sh [tag]            # default tag: latest
#   ./scripts/build-pi-image.sh [tag] --no-cache # force full rebuild

set -eu

GITHUB_USERNAME="${GITHUB_USERNAME:-houlasley}"
IMAGE="ghcr.io/${GITHUB_USERNAME}/actual-server"
TAG="${1:-latest}"
FULL_IMAGE="${IMAGE}:${TAG}"
NO_CACHE=""

for arg in "$@"; do
  if [ "$arg" = "--no-cache" ]; then
    NO_CACHE="--no-cache"
  fi
done

echo "==> Building ${FULL_IMAGE} for linux/arm64${NO_CACHE:+ (no cache)}"

# Ensure the multi-platform builder exists
if ! docker buildx inspect pi-builder >/dev/null 2>&1; then
  docker buildx create --name pi-builder --driver docker-container --bootstrap
fi

docker buildx build \
  --builder pi-builder \
  --platform linux/arm64 \
  --file sync-server.Dockerfile \
  --tag "${FULL_IMAGE}" \
  --provenance=false \
  --push \
  $NO_CACHE \
  .

echo ""
echo "==> Done. Image pushed: ${FULL_IMAGE}"
echo ""
echo "To deploy on your Pi:"
echo "  docker compose pull actual_custom && docker compose up -d actual_custom"
