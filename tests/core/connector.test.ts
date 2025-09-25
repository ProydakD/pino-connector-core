import { describe, expect, it, vi } from "vitest";
import pino from "pino";

import { createConnector } from "../../src/core/connector.js";
import type {
  LogContext,
  TransportFactory,
  TransportPublishPayload,
} from "../../src/core/types.js";

const waitForAsyncWork = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe("createConnector", () => {
  it("routes records through transports with plugins and serializers", async () => {
    const publishRecords: TransportPublishPayload["record"][] = [];
    const createMemoryTransport: TransportFactory = vi.fn(async () => ({
      async publish(payload) {
        publishRecords.push(payload.record);
      },
      getDiagnostics() {
        return { isHealthy: true };
      },
    }));

    const beforeHook = vi.fn(({ record, setRecord }) => {
      const data =
        (record.metadata.data as Record<string, unknown> | undefined) ?? {};
      setRecord({
        ...record,
        message: `${record.message}-tagged`,
        metadata: {
          ...record.metadata,
          data: { ...data, fromHook: true },
        },
      });
    });
    const afterHook = vi.fn();
    const serializer = vi.fn((context) => {
      if (context.key === "metadata.data.secret") {
        context.redact();
      }
    });

    const connector = createConnector<LogContext>({
      logger: pino({ enabled: false }),
      useBuiltinTransports: false,
      transportFactories: {
        memory: createMemoryTransport,
      },
      config: {
        level: "info",
        context: {
          initial: { region: "eu" },
          propagateAsync: true,
        },
        transports: [
          {
            name: "memory",
            config: {},
          },
        ],
        plugins: [
          { name: "before", stage: "before", hook: beforeHook },
          { name: "after", stage: "after", hook: afterHook },
        ],
        serializers: {
          "metadata.data.secret": serializer,
        },
      },
    });

    await waitForAsyncWork();

    connector.setContext({ requestId: "abc" });
    const logger = connector.getRootLogger();
    logger.info("demo", { data: { secret: "value", kept: "safe" } });

    await waitForAsyncWork();
    await waitForAsyncWork();

    expect(beforeHook).toHaveBeenCalledTimes(1);
    expect(serializer).toHaveBeenCalledTimes(1);
    expect(afterHook).toHaveBeenCalledTimes(1);
    expect(createMemoryTransport).toHaveBeenCalledTimes(1);
    expect(publishRecords).toHaveLength(1);

    const record = publishRecords[0]!;
    expect(record.message).toBe("demo-tagged");
    expect(record.context).toEqual({ region: "eu", requestId: "abc" });
    const data = (record.metadata.data ?? {}) as Record<string, unknown>;
    expect(data).toEqual({ kept: "safe", fromHook: true });

    const afterContext = afterHook.mock.calls[0]![0];
    expect(afterContext.record).toBe(record);
    expect(afterContext.transportResults).toEqual([
      { transportName: "memory", succeeded: true },
    ]);

    await connector.shutdown();
  });

  it("updates configuration and re-registers transports", async () => {
    let factoryInvocations = 0;
    const memoryFactory: TransportFactory = async () => {
      factoryInvocations += 1;
      return {
        async publish() {
          // noop
        },
      };
    };

    const connector = createConnector({
      logger: pino({ enabled: false }),
      useBuiltinTransports: false,
      transportFactories: {
        memory: memoryFactory,
      },
      config: {
        level: "info",
        context: {
          initial: {},
          propagateAsync: true,
        },
        transports: [],
      },
    });

    await waitForAsyncWork();
    expect(factoryInvocations).toBe(0);

    connector.updateConfig({
      transports: [
        {
          name: "memory",
          config: {},
        },
      ],
      context: {
        initial: { tenant: "acme" },
        propagateAsync: false,
      },
    });

    await waitForAsyncWork();
    await waitForAsyncWork();

    expect(factoryInvocations).toBe(1);
    expect(connector.getTransports().map((item) => item.name)).toContain(
      "memory",
    );
    expect(connector.getContext()).toEqual({ tenant: "acme" });
    expect(connector.config.context.propagateAsync).toBe(false);

    await connector.shutdown();
  });

  it("prevents logging after shutdown", async () => {
    const connector = createConnector({
      logger: pino({ enabled: false }),
      useBuiltinTransports: false,
      config: {
        level: "info",
        context: {
          initial: {},
          propagateAsync: true,
        },
        transports: [],
      },
    });

    const logger = connector.getRootLogger();
    logger.info("before shutdown");

    await connector.shutdown();

    expect(connector.state).toBe("stopped");
    expect(() => logger.info("after shutdown")).toThrow(
      "Connector has been shut down.",
    );
  });
});
