# Uma imagem por serviço: docker build --build-arg APP=gateway .
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP
RUN npx nest build ${APP}

FROM node:22-alpine
WORKDIR /app
ARG APP
ENV NODE_ENV=production SERVICE_NAME=${APP} APP=${APP}
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD node dist/apps/${APP}/src/main.js
