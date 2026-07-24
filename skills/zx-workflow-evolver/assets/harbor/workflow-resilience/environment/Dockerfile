FROM node:22.22.0-bookworm-slim

# Pin zx so the task's declared entrypoint can be executed independently of global drift.
RUN npm install --global zx@8.8.5

# Keep the agent's writable project location explicit and separate from verifier files.
WORKDIR /app
