FROM scratch

ARG SOURCE_SHA
LABEL org.opencontainers.image.title="Workspace CNB TypeScript cache" \
      org.opencontainers.image.revision="${SOURCE_SHA}"

COPY types/ /workspace/.cache/types/
COPY tsbuild/ /workspace/.cache/tsbuild/

CMD ["/cache-only"]
