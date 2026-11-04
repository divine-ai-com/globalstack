FROM node:22-bookworm-slim

LABEL io.globalstack.owner="globalstack"
LABEL io.globalstack.product="azure-emulator"
LABEL io.globalstack.scope="platform-runtime"
LABEL io.globalstack.cloud="azure"

ENV NODE_ENV=production
ENV GLOBALSTACK_HOST=0.0.0.0
ENV GLOBALSTACK_ARM_HOST=0.0.0.0
ENV GLOBALSTACK_ARM_PORT=4566

WORKDIR /opt/globalstack

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci --omit=dev

EXPOSE 4566

CMD ["node", "apps/emulator/server.mjs"]
