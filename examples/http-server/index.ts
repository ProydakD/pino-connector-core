import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import {
  createConnector,
  createStdoutTransport,
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
  selfLogger.info("memory transport ready", {
    name: registration.name,
  });

  return {
    async publish(payload) {
      memoryState.records.push(payload.record);
    },
    async shutdown() {
      memoryState.records.length = 0;
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

const connector = createConnector({
  config: {
    level: "info",
    context: {
      initial: {
        service: "http-demo",
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

let activeTransport: "stdout" | "memory" = "stdout";

async function useMemoryTransport(): Promise<void> {
  if (activeTransport === "memory") {
    return;
  }

  await connector.registerTransport(
    {
      name: "memory",
      config: {},
    },
    createMemoryTransport,
  );
  await connector.removeTransport("stdout");
  activeTransport = "memory";
}

async function useStdoutTransport(): Promise<void> {
  if (activeTransport === "stdout") {
    return;
  }

  await connector.registerTransport(
    {
      name: "stdout",
      config: {
        eol: "\n",
      },
    },
    createStdoutTransport,
  );
  await connector.removeTransport("memory");
  activeTransport = "stdout";
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const context: LogContext = {
    requestId: randomUUID(),
    method: req.method ?? "GET",
    path: url.pathname,
  };

  await connector.runWithContext(context, async () => {
    const logger = connector.createLogger({ component: "http" });

    if (url.pathname === "/switch") {
      const target = url.searchParams.get("transport");
      if (target === "memory") {
        await useMemoryTransport();
        logger.info("switched to memory transport");
      } else if (target === "stdout") {
        await useStdoutTransport();
        logger.info("switched to stdout transport");
      } else {
        res.statusCode = 400;
        res.end("unknown transport");
        return;
      }

      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          activeTransport,
          transports: connector
            .getTransports()
            .map((transport) => transport.name),
        }),
      );
      return;
    }

    if (url.pathname === "/records") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          memoryState.records.map((record) => ({
            message: record.message,
            level: record.level,
            context: record.context,
          })),
        ),
      );
      return;
    }

    logger.info("handling request", {
      data: {
        activeTransport,
      },
    });

    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        activeTransport,
      }),
    );
  });

  await connector.flush();
}

const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    const logger = connector.createLogger({ component: "http" });
    logger.error("request failed", { error });
    res.statusCode = 500;
    res.end("internal error");
  }
});

server.listen(3000, () => {
  const logger = connector.createLogger({ component: "http" });
  logger.info("server listening", { data: { port: 3000 } });
  console.log("Server running at http://localhost:3000");
});

process.on("SIGINT", async () => {
  console.log("\nReceived SIGINT, shutting down...");
  server.close();
  await connector.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nReceived SIGTERM, shutting down...");
  server.close();
  await connector.shutdown();
  process.exit(0);
});
