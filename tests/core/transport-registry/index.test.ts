import { describe, expect, it, vi } from "vitest";

import { createTransportRegistry } from "../../../src/core/transport-registry/index.js";
import type {
  DiagnosticsLogger,
  LogRecord,
  TransportFactory,
  TransportLifecycle,
  TransportRegistration,
} from "../../../src/core/types.js";

function createDiagnosticsLogger(): DiagnosticsLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    level: "info",
    timestamp: Date.now(),
    message: "test",
    bindings: {},
    context: {},
    metadata: {},
    ...overrides,
  } satisfies LogRecord;
}

describe("createTransportRegistry", () => {
  it("registers transports and exposes them via diagnostics", async () => {
    const registry = createTransportRegistry(createDiagnosticsLogger());
    const lifecycle: TransportLifecycle = {
      async publish() {
        // noop
      },
    };

    const factory: TransportFactory = vi.fn(async () => {
      return lifecycle;
    });

    const registration: TransportRegistration = {
      name: "memory",
      config: {},
    };

    const registered = await registry.register(registration, factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(registered.registration.name).toBe("memory");
    expect(registry.list().map((item) => item.name)).toContain("memory");
    expect(
      registry
        .getDiagnostics()
        .transports.map((item) => item.registration.name),
    ).toContain("memory");
  });

  it("fan-outs only to transports that match level threshold", async () => {
    const registry = createTransportRegistry(createDiagnosticsLogger());
    const createFactory = () => {
      const publish = vi.fn(async () => {
        // noop
      });
      const factory: TransportFactory = async () => ({ publish });
      return { factory, publish };
    };

    const infoTransport = createFactory();
    const errorTransport = createFactory();

    await registry.register(
      { name: "info", config: {} },
      infoTransport.factory,
    );
    await registry.register(
      { name: "error", level: "error", config: {} },
      errorTransport.factory,
    );

    const infoResult = await registry.publish(createRecord({ level: "info" }));

    expect(infoTransport.publish).toHaveBeenCalledTimes(1);
    expect(errorTransport.publish).not.toHaveBeenCalled();
    expect(infoResult).toEqual([{ transportName: "info", succeeded: true }]);

    await registry.publish(createRecord({ level: "error" }));

    expect(errorTransport.publish).toHaveBeenCalledTimes(1);
  });

  it("records failures and flushes offending transports", async () => {
    const registry = createTransportRegistry(createDiagnosticsLogger());
    const failure = new Error("boom");
    const flush = vi.fn(async () => {
      // noop
    });
    const factory: TransportFactory = async () => ({
      async publish() {
        throw failure;
      },
      flush,
    });

    await registry.register({ name: "unstable", config: {} }, factory);

    const results = await registry.publish(createRecord());

    expect(results).toEqual([
      { transportName: "unstable", succeeded: false, error: failure },
    ]);
    expect(flush).toHaveBeenCalledTimes(1);

    const diagnostics = registry.getDiagnostics();
    expect(diagnostics.failures).toHaveLength(1);
    expect(diagnostics.failures[0]?.error).toBe(failure);
  });
});
