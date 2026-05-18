FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV GLOBALSTACK_ARM_HOST=0.0.0.0
ENV GLOBALSTACK_ARM_PORT=4566

WORKDIR /opt/globalstack

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

EXPOSE 4566

CMD ["node", "apps/emulator/server.mjs"]
