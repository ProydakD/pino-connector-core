import {
  createConnector,
  type Connector,
  type LogContext,
  type TransportFactory,
  type TransportPublishPayload,
} from "../../src/index.js";

interface MemoryTransportState {
  records: TransportPublishPayload["record"][];
}

const memoryState: MemoryTransportState = { records: [] };

const createMemoryTransport: TransportFactory = (
  registration,
  { selfLogger },
) => {
  selfLogger.info("memory transport activated", {
    name: registration.name,
  });

  return {
    async publish(payload) {
      memoryState.records.push(payload.record);
    },
    getDiagnostics() {
      return {
        isHealthy: true,
        details: {
          buffered: memoryState.records.length,
        },
      };
    },
  };
};

async function demonstrateContext(connector: Connector): Promise<void> {
  const logger = connector.getRootLogger();

  console.log("Initial context", connector.getContext());

  await connector.runWithContext(
    {
      requestId: "req-001",
      userId: 42,
    } satisfies LogContext,
    async () => {
      logger.info("handling first request");
    },
  );

  console.log("Context after first request", connector.getContext());

  connector.setContext({
    sessionId: "session-123",
  });

  logger.info("applied partial context update");

  await connector.runWithContext(
    {
      requestId: "req-002",
    } satisfies LogContext,
    async () => {
      logger.info("handling second request");
    },
  );

  console.log("Context after second request", connector.getContext());
}

async function demonstrateTransportSwitch(connector: Connector): Promise<void> {
  const logger = connector.getRootLogger();

  await connector.runWithContext(
    { requestId: "req-stdout" } satisfies LogContext,
    async () => {
      logger.info("logging through stdout transport");
    },
  );

  await connector.registerTransport(
    {
      name: "memory",
      config: {},
    },
    createMemoryTransport,
  );

  await connector.removeTransport("stdout");

  await connector.runWithContext(
    { requestId: "req-memory" } satisfies LogContext,
    async () => {
      logger.info("logging through memory transport");
    },
  );

  await connector.flush();

  console.log(
    "Memory transport contents",
    memoryState.records.map((record) => ({
      message: record.message,
      context: record.context,
      level: record.level,
    })),
  );
}

async function main(): Promise<void> {
  const connector = createConnector({
    config: {
      level: "info",
      context: {
        initial: {
          app: "basic-node-demo",
        },
        propagateAsync: true,
      },
      transports: [
        {
          name: "stdout",
          config: {
            eol: "\n",
          },
        },
      ],
    },
  });

  await demonstrateContext(connector);
  await demonstrateTransportSwitch(connector);

  await connector.shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
