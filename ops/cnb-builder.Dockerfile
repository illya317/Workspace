FROM node:24-bookworm@sha256:5711a0d445a1af54af9589066c646df387d1831a608226f4cd694fc59e745059

LABEL org.opencontainers.image.title="Workspace CNB release builder"
LABEL org.opencontainers.image.description="Pinned Node 24 build environment for Workspace standalone releases"

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    g++ \
    make \
    openssh-client \
    postgresql \
    postgresql-client \
    python3 \
    rsync \
    tar \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
