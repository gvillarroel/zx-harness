FROM node:22.22.0-bookworm-slim

# Pin zx and install the exact terminal tools required by generated workflows and their verifier.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fd-find git jq ripgrep \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && npm install --global zx@8.8.5 \
    && rm -rf /var/lib/apt/lists/*

# Keep generated artifacts in Harbor's writable project directory.
WORKDIR /app
