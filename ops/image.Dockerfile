FROM node:24-bookworm-slim

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY runtime/ ./
COPY release/ /release/

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
EXPOSE 3000
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bash", "-ceu", "entry=$(cat .server-entry); exec node \"$entry\""]
