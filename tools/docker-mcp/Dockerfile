# Build from an explicit Git snapshot prepared by build.mjs, never a live worktree.
FROM node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a AS build
WORKDIR /build
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ \
 && node node_modules/typescript/bin/tsc --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --rewriteRelativeImportExtensions --outDir /compiled --rootDir . packages/mcp-server/src/index.mts

FROM node@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.title="Desktop Control" \
      org.opencontainers.image.authors="Anon Allman" \
      org.opencontainers.image.source="https://github.com/lxcoding95/desktop-control" \
      org.opencontainers.image.revision=$SOURCE_COMMIT
WORKDIR /app
COPY --from=build /compiled/packages/mcp-server/src/ ./src/
COPY --from=build /build/node_modules/@modelcontextprotocol/server/ ./node_modules/@modelcontextprotocol/server/
COPY --from=build /build/node_modules/@modelcontextprotocol/core/ ./node_modules/@modelcontextprotocol/core/
COPY --from=build /build/node_modules/zod/ ./node_modules/zod/
COPY LICENSE ./LICENSE
USER 1000:1000
ENTRYPOINT ["node", "src/index.mjs"]
