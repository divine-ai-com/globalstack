FROM mcr.microsoft.com/azure-functions/node:4-node22@sha256:5d70744cc5e5aa04e2b767db2651f97be13d6fc5f81224f7bba2c936b48f7a76
WORKDIR /home/site/wwwroot
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY adapters.mjs events.mjs functions.mjs scanner-diagnostic.mjs repository.mjs schema.sql host.json ./
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    FUNCTIONS_WORKER_RUNTIME=node
