FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN chmod +x docker/docker-entrypoint.sh

ENV NODE_ENV=production \
    DOCKER_CONTAINER=1 \
    APP_MODE=telegram \
    TV_CDP_HOST=host.docker.internal \
    TV_CDP_PORT=9222

ENTRYPOINT ["./docker/docker-entrypoint.sh"]
CMD ["telegram"]
