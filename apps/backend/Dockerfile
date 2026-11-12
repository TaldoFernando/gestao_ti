# Uma imagem por serviço: docker build --build-arg APP=gateway .
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
ARG APP
RUN npx nest build ${APP} && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ARG APP
ENV NODE_ENV=production SERVICE_NAME=${APP} APP=${APP}
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps ./apps
# Volume de anexos herda este dono na primeira montagem.
RUN mkdir -p /data/uploads && chown node /data/uploads
USER node
# Serviços com banco aplicam as migrações antes de subir.
CMD if [ -d apps/$APP/prisma ]; then npx prisma migrate deploy --schema apps/$APP/prisma/schema.prisma; fi && node dist/apps/$APP/src/main.js
