import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

import { createStdoutTransport } from "../../src/transports/stdout.js";
import type { DiagnosticsLogger } from "../../src/core/types.js";

class FakeStdout extends EventEmitter {
  public chunks: string[] = [];
  public drained = false;
  public flush = vi.fn();
  public shouldBackpressure = false;

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    if (this.shouldBackpressure) {
      setImmediate(() => {
        this.shouldBackpressure = false;
        this.emit("drain");
      });
      return false;
    }
    return true;
  }
}

describe("createStdoutTransport", () => {
  let originalStdout: NodeJS.WriteStream;
  let fakeStdout: FakeStdout;

  const logger: DiagnosticsLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    fakeStdout = new FakeStdout();
    originalStdout = process.stdout;
    Object.defineProperty(process, "stdout", {
      configurable: true,
      value: fakeStdout,
    });
    vi.clearAllMocks();
  });

  it("writes JSON payloads and awaits drain when backpressure occurs", async () => {
    fakeStdout.shouldBackpressure = true;
    const transport = await createStdoutTransport(
      { name: "stdout", config: {} },
      { selfLogger: logger },
    );

    await transport.publish({
      record: {
        level: "info",
        timestamp: 0,
        message: "hello",
        bindings: { component: "test" },
        context: { requestId: "1" },
        metadata: {},
      },
    });

    expect(fakeStdout.chunks).toHaveLength(1);
    const chunk = fakeStdout.chunks[0];
    expect(chunk).toBeDefined();
    const parsed = JSON.parse(chunk!.trim());
    expect(parsed).toMatchObject({
      msg: "hello",
      bindings: { component: "test" },
      context: { requestId: "1" },
    });
    expect(logger.info).toHaveBeenCalledWith("stdout transport initialized", {
      eol: "\n",
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("invokes flush when available and logs flush failures", async () => {
    fakeStdout.flush.mockImplementationOnce(() => {
      throw new Error("flush failed");
    });

    const transport = await createStdoutTransport(
      { name: "stdout", config: {} },
      { selfLogger: logger },
    );

    if (transport.flush) {
      await transport.flush();
    }

    expect(fakeStdout.flush).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "stdout transport flush raised error",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  afterEach(() => {
    Object.defineProperty(process, "stdout", {
      configurable: true,
      value: originalStdout,
    });
  });
});
