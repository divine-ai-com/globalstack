import { officialEmulatorOptions } from '../../core/src/azure-tier1-capabilities.mjs';

function serviceName(id) {
  return id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

export function renderOfficialEmulatorCompose() {
  const lines = [
    'name: globalstack-official-azure-emulators',
    'services:',
  ];

  for (const option of officialEmulatorOptions.filter(item => item.image)) {
    const name = serviceName(option.id);
    lines.push(`  ${name}:`);
    lines.push(`    image: ${option.image}`);
    lines.push('    profiles:');
    lines.push(`      - ${name}`);
    lines.push('      - all');
    if (option.ports?.length && option.id !== 'service-bus-emulator') {
      lines.push('    ports:');
      for (const port of option.ports) lines.push(`      - "127.0.0.1:${port}"`);
    }
    if (option.id === 'azurite') {
      lines.push('    command: azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0');
    }
    if (option.id === 'service-bus-emulator') {
      lines.push('    ports:');
      lines.push('      - "127.0.0.1:5672:5672"');
      lines.push('      - "127.0.0.1:${GLOBALSTACK_SERVICEBUS_HTTP_PORT:-5300}:${GLOBALSTACK_SERVICEBUS_HTTP_PORT:-5300}"');
      lines.push('    volumes:');
      lines.push('      - ./service-bus-config.json:/ServiceBus_Emulator/ConfigFiles/Config.json:ro');
      lines.push('    depends_on:');
      lines.push('      - service-bus-sql');
      lines.push('    environment:');
      lines.push('      SQL_SERVER: service-bus-sql');
      lines.push('      MSSQL_SA_PASSWORD: ${GLOBALSTACK_MSSQL_PASSWORD:-GlobalStack!12345}');
      lines.push('      ACCEPT_EULA: "Y"');
      lines.push('      EMULATOR_HTTP_PORT: ${GLOBALSTACK_SERVICEBUS_HTTP_PORT:-5300}');
      lines.push('      SQL_WAIT_INTERVAL: ${GLOBALSTACK_SERVICEBUS_SQL_WAIT_INTERVAL:-30}');
    }
    if (option.id === 'event-hubs-emulator') {
      lines.push('    depends_on:');
      lines.push('      - event-hubs-sql');
      lines.push('    environment:');
      lines.push('      SQL_SERVER: event-hubs-sql');
      lines.push('      MSSQL_SA_PASSWORD: ${GLOBALSTACK_MSSQL_PASSWORD:-GlobalStack!12345}');
      lines.push('      ACCEPT_EULA: "Y"');
    }
    if (option.id === 'local-postgres') {
      lines.push('    environment:');
      lines.push('      POSTGRES_USER: ${GLOBALSTACK_POSTGRES_USER:-globalstack}');
      lines.push('      POSTGRES_PASSWORD: ${GLOBALSTACK_POSTGRES_PASSWORD:-globalstack}');
      lines.push('      POSTGRES_DB: ${GLOBALSTACK_POSTGRES_DB:-globalstack}');
    }
    if (option.id === 'local-mysql') {
      lines.push('    environment:');
      lines.push('      MYSQL_ROOT_PASSWORD: ${GLOBALSTACK_MYSQL_ROOT_PASSWORD:-globalstack}');
      lines.push('      MYSQL_DATABASE: ${GLOBALSTACK_MYSQL_DATABASE:-globalstack}');
      lines.push('      MYSQL_USER: ${GLOBALSTACK_MYSQL_USER:-globalstack}');
      lines.push('      MYSQL_PASSWORD: ${GLOBALSTACK_MYSQL_PASSWORD:-globalstack}');
    }
  }

  lines.push('  service-bus-sql:');
  lines.push('    image: mcr.microsoft.com/mssql/server:2022-latest');
  lines.push('    profiles: ["service-bus-emulator", "all"]');
  lines.push('    environment:');
  lines.push('      ACCEPT_EULA: "Y"');
  lines.push('      MSSQL_SA_PASSWORD: ${GLOBALSTACK_MSSQL_PASSWORD:-GlobalStack!12345}');
  lines.push('');
  lines.push('  event-hubs-sql:');
  lines.push('    image: mcr.microsoft.com/mssql/server:2022-latest');
  lines.push('    profiles: ["event-hubs-emulator", "all"]');
  lines.push('    environment:');
  lines.push('      ACCEPT_EULA: "Y"');
  lines.push('      MSSQL_SA_PASSWORD: ${GLOBALSTACK_MSSQL_PASSWORD:-GlobalStack!12345}');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export function officialEmulatorEnvironment() {
  return {
    AZURITE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
    GLOBALSTACK_ARM_ENDPOINT: 'http://127.0.0.1:4570',
    GLOBALSTACK_SERVICEBUS_ENDPOINT: 'amqp://127.0.0.1:5672',
    GLOBALSTACK_SERVICEBUS_HTTP_ENDPOINT: 'http://127.0.0.1:5300',
    GLOBALSTACK_SERVICEBUS_CONNECTION_STRING: 'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;',
    GLOBALSTACK_EVENTHUBS_ENDPOINT: 'amqp://127.0.0.1:5672',
    GLOBALSTACK_APP_CONFIGURATION_ENDPOINT: 'http://127.0.0.1:8483',
    GLOBALSTACK_FUNCTIONS_ENDPOINT: 'http://127.0.0.1:7071',
    GLOBALSTACK_POSTGRES_ENDPOINT: 'postgres://globalstack:globalstack@127.0.0.1:5432/globalstack',
    GLOBALSTACK_MYSQL_ENDPOINT: 'mysql://globalstack:globalstack@127.0.0.1:3306/globalstack',
    GLOBALSTACK_REDIS_ENDPOINT: 'redis://127.0.0.1:6379',
  };
}

export function renderServiceBusEmulatorConfig() {
  return JSON.stringify({
    UserConfig: {
      Namespaces: [
        {
          Name: 'sbemulatorns',
          Queues: [
            {
              Name: 'robot-telemetry',
              Properties: {
                DeadLetteringOnMessageExpiration: false,
                DefaultMessageTimeToLive: 'PT1H',
                DuplicateDetectionHistoryTimeWindow: 'PT20S',
                ForwardDeadLetteredMessagesTo: '',
                ForwardTo: '',
                LockDuration: 'PT1M',
                MaxDeliveryCount: 3,
                RequiresDuplicateDetection: false,
                RequiresSession: false,
              },
            },
          ],
          Topics: [
            {
              Name: 'topic.1',
              Properties: {
                DefaultMessageTimeToLive: 'PT1H',
                DuplicateDetectionHistoryTimeWindow: 'PT20S',
                RequiresDuplicateDetection: false,
              },
              Subscriptions: [
                {
                  Name: 'subscription.1',
                  Properties: {
                    DeadLetteringOnMessageExpiration: false,
                    DefaultMessageTimeToLive: 'PT1H',
                    LockDuration: 'PT1M',
                    MaxDeliveryCount: 3,
                    ForwardDeadLetteredMessagesTo: '',
                    ForwardTo: '',
                    RequiresSession: false,
                  },
                },
              ],
            },
          ],
        },
      ],
      Logging: {
        Type: 'File',
      },
    },
  }, null, 2);
}
