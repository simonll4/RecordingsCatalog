FROM bluenviron/mediamtx:latest-ffmpeg

# Install curl inside the MediaMTX image so runOn* hooks can POST to session-store.
# Try common package managers (alpine, debian/ubuntu, rhel) and fail clearly otherwise.
RUN sh -c 'if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*; \
    elif command -v microdnf >/dev/null 2>&1; then \
      microdnf install -y curl ca-certificates || true; \
    else \
      echo "No known package manager to install curl" >&2; exit 1; \
    fi'

