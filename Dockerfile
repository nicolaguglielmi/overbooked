# Overbooked! on Cloud Run: the single-file build plus the small Gemini proxy.
# The API key is NOT in the image: Cloud Run injects it from Secret Manager
# (see README, "Pubblicazione con l'AI"). .env is excluded by .dockerignore.
FROM node:22-alpine
WORKDIR /app
# firebase-config.js is local (out of git); the build falls back to the example
COPY index.html firebase-config*.js ./
COPY css ./css
COPY js ./js
COPY assets/sprites ./assets/sprites
COPY tools/build.mjs ./tools/build.mjs
COPY server ./server
RUN node tools/build.mjs
ENV HOST=0.0.0.0 STATIC_ROOT=dist NODE_ENV=production
USER node
CMD ["node", "server/server.mjs"]
