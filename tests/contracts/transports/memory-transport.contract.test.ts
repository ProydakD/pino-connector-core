import { describe, expect, it, vi } from "vitest";

import { createTransportRegistry } from "../../../src/core/transport-registry/index.js";
import type { DiagnosticsLogger } from "../../../src/core/types.js";
import { createLogRecord } from "../../fixtures/log-record.js";
import { createMemoryTransportFixture } from "../../fixtures/memory-transport.js";

describe("transport contract", () => {
  it("publishes records, exposes diagnostics and honours lifecycle contract", async () => {
    const diagnosticsLogger: DiagnosticsLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const registry = createTransportRegistry(diagnosticsLogger);
    const memoryTransport = createMemoryTransportFixture();

    await registry.register(
      { name: "memory", config: {} },
      memoryTransport.factory,
    );

    const record = createLogRecord({ message: "contract-transport" });
    const results = await registry.publish(record);

    expect(results).toEqual([{ transportName: "memory", succeeded: true }]);
    expect(memoryTransport.records).toHaveLength(1);
    expect(memoryTransport.records[0]).toMatchObject({
      message: "contract-transport",
    });
    expect(diagnosticsLogger.info).toHaveBeenCalledWith(
      "memory transport published",
      expect.objectContaining({ buffered: 1, transport: "memory" }),
    );

    await registry.flush();
    await registry.shutdown();

    expect(memoryTransport.getFlushCount()).toBe(1);
    expect(memoryTransport.getShutdownCount()).toBe(1);
    expect(memoryTransport.records).toHaveLength(0);
  });

  it("reports failures and keeps diagnostics history", async () => {
    const diagnosticsLogger: DiagnosticsLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const registry = createTransportRegistry(diagnosticsLogger);
    const failure = new Error("publish failed");
    const failingTransport = createMemoryTransportFixture({
      failOnPublish: failure,
    });

    await registry.register(
      { name: "memory", config: {} },
      failingTransport.factory,
    );

    const record = createLogRecord({ message: "contract-failure" });
    const results = await registry.publish(record);

    expect(results).toEqual([
      { transportName: "memory", succeeded: false, error: failure },
    ]);
    expect(failingTransport.records).toHaveLength(0);
    expect(failingTransport.getFlushCount()).toBe(1);
    expect(diagnosticsLogger.error).toHaveBeenCalledWith(
      "memory transport publish failed",
      expect.objectContaining({ error: failure, transport: "memory" }),
    );

    const diagnostics = registry.getDiagnostics();
    expect(diagnostics.failures).toHaveLength(1);
    expect(diagnostics.failures[0]?.error).toBe(failure);
  });
});
