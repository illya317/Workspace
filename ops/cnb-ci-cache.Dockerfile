FROM node:24-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl g++ git jq make openssh-client postgresql postgresql-client python3 ripgrep rsync \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/workspace-deps

COPY package.json package-lock.json ./
RUN npm ci --no-audit --fund=false --loglevel=error

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN ./node_modules/.bin/playwright install --with-deps chromium \
  && npm cache clean --force \
  && rm -rf /root/.npm

WORKDIR /workspace
