import { describe, expect, it, vi } from "vitest";
import pino, { type Logger as PinoLogger } from "pino";

import { createConnector } from "../../src/core/connector.js";
import * as transportsModule from "../../src/transports/index.js";
import type {
  LogContext,
  TransportFactory,
  TransportPublishPayload,
} from "../../src/core/types.js";

const waitForAsyncWork = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

function createStubLogger(): {
  readonly logger: PinoLogger;
  readonly warn: ReturnType<typeof vi.fn>;
} {
  const warn = vi.fn();
  const info = vi.fn();
  const error = vi.fn();
  const debug = vi.fn();
  const trace = vi.fn();
  const fatal = vi.fn();
  const flush = vi.fn();
  const child = vi.fn();
  const stub: Partial<PinoLogger> & Record<string, unknown> = {
    level: "info",
    warn,
    info,
    error,
    debug,
    trace,
    fatal,
    flush,
  };
  child.mockReturnValue(stub);
  Object.assign(stub, { child });
  return { logger: stub as PinoLogger, warn, error, info };
}

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

  it("logs warning when configured transport factory throws", async () => {
    const { logger, warn } = createStubLogger();
    const failingFactory: TransportFactory = async () => {
      throw new Error("factory failed");
    };

    const connector = createConnector({
      logger,
      useBuiltinTransports: false,
      transportFactories: {
        broken: failingFactory,
      },
      config: {
        transports: [
          {
            name: "broken",
            config: {},
          },
        ],
      },
    });

    await waitForAsyncWork();
    await waitForAsyncWork();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: "broken",
        error: expect.any(Error),
      }),
      "failed to register configured transport",
    );

    await connector.shutdown();
  });

  it("registers and removes transports via public API", async () => {
    const { logger, warn } = createStubLogger();
    const transportClose = vi.fn();
    (
      logger as unknown as { transport?: { close?: () => Promise<void> } }
    ).transport = {
      close: transportClose,
    };

    const lifecycleShutdown = vi.fn(async () => {});
    const lifecycleFlush = vi.fn(async () => {});

    const connector = createConnector({
      logger,
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

    const factory = vi.fn(async () => ({
      async publish() {
        // noop
      },
      flush: lifecycleFlush,
      shutdown: lifecycleShutdown,
    }));

    await connector.registerTransport({ name: "dynamic", config: {} }, factory);
    await waitForAsyncWork();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(connector.getTransports().map((item) => item.name)).toContain(
      "dynamic",
    );

    await connector.flush();
    expect(logger.flush as ReturnType<typeof vi.fn>).toHaveBeenCalled();

    await connector.removeTransport("dynamic");
    expect(
      connector.getTransports().some((item) => item.name === "dynamic"),
    ).toBe(false);

    await connector.shutdown();
    expect(lifecycleFlush).toHaveBeenCalled();
    expect(lifecycleShutdown).toHaveBeenCalled();
    expect(transportClose).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
  it("warns when builtin transport registration fails", async () => {
    const { logger, warn } = createStubLogger();
    const builtinSpy = vi
      .spyOn(transportsModule, "registerBuiltinTransports")
      .mockRejectedValue(new Error("builtin failure"));

    const connector = createConnector({ logger });

    await waitForAsyncWork();
    await waitForAsyncWork();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "failed to register builtin transports",
    );

    builtinSpy.mockRestore();
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
