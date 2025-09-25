import {
  createConnector,
  createCustomTransportStore,
  mergeTransportFactories,
  type TransportFactory,
  type TransportPublishPayload,
} from "../../src/index.js";

interface MemoryTransportState {
  records: TransportPublishPayload["record"][];
}

const memoryStore: MemoryTransportState = { records: [] };

const createMemoryTransport: TransportFactory = (registration) => {
  return {
    async publish(payload) {
      memoryStore.records.push(payload.record);
    },
    getDiagnostics() {
      return {
        isHealthy: true,
        details: {
          name: registration.name,
          buffered: memoryStore.records.length,
        },
      };
    },
  };
};

async function main(): Promise<void> {
  const customStore = createCustomTransportStore();
  customStore.register({
    registration: {
      name: "memory",
      config: {},
    },
    factory: createMemoryTransport,
  });

  const connector = createConnector({
    customTransports: customStore,
    transportFactories: mergeTransportFactories(undefined, customStore),
    config: {
      level: "info",
      transports: Array.from(customStore.registrations.values()),
    },
  });

  const logger = connector.getRootLogger();
  logger.info("hello from custom transport", { example: true });
  await connector.flush();

  console.log(
    memoryStore.records.map((record) => ({
      message: record.message,
      level: record.level,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
