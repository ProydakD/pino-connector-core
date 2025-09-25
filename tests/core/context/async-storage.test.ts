import { describe, expect, it } from "vitest";

import { createAsyncContextManager } from "../../../src/core/context/async-storage.js";
import type { LogContext } from "../../../src/core/types.js";

const waitForTick = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe("createAsyncContextManager", () => {
  it("returns cloned snapshots when reading context", () => {
    const manager = createAsyncContextManager<LogContext>({
      initialContext: { requestId: "initial" },
      propagateAsync: true,
    });

    const first = manager.getContext();
    first.requestId = "mutated";

    const second = manager.getContext();

    expect(first).not.toBe(second);
    expect(second).toEqual({ requestId: "initial" });
  });

  it("merges patches when setting context", () => {
    const manager = createAsyncContextManager<LogContext>({
      initialContext: { region: "eu" },
      propagateAsync: false,
    });

    manager.setContext({ requestId: "42" });

    expect(manager.getContext()).toEqual({ region: "eu", requestId: "42" });
  });

  it("propagates context across async boundaries when enabled", async () => {
    const manager = createAsyncContextManager<LogContext>({
      initialContext: { region: "us" },
      propagateAsync: true,
    });

    let immediate: LogContext | undefined;
    const seen = await manager.runWithContext(
      { requestId: "run-1" },
      async () => {
        immediate = manager.getContext();
        await waitForTick();
        return manager.getContext();
      },
    );

    expect(immediate).toEqual({ requestId: "run-1" });
    expect(seen).toEqual({ requestId: "run-1" });
    expect(manager.getContext()).toEqual({ region: "us" });
  });

  it("falls back to previous context after async hop when propagation disabled", async () => {
    const manager = createAsyncContextManager<LogContext>({
      initialContext: { region: "apac" },
      propagateAsync: false,
    });

    let immediate: LogContext | undefined;
    const seen = await manager.runWithContext(
      { requestId: "local" },
      async () => {
        immediate = manager.getContext();
        await waitForTick();
        return manager.getContext();
      },
    );

    expect(immediate).toEqual({ requestId: "local" });
    expect(seen).toEqual({ region: "apac" });
    expect(manager.getContext()).toEqual({ region: "apac" });
  });

  it("reconfigures initial context and propagation mode", async () => {
    const manager = createAsyncContextManager<LogContext>({
      initialContext: { region: "us" },
      propagateAsync: true,
    });

    manager.setContext({ userId: "before" });

    manager.configure({
      initialContext: { region: "eu", tenant: "acme" },
      propagateAsync: false,
    });

    expect(manager.getContext()).toEqual({ region: "eu", tenant: "acme" });

    let immediate: LogContext | undefined;
    const seen = await manager.runWithContext(
      { requestId: "config" },
      async () => {
        immediate = manager.getContext();
        await waitForTick();
        return manager.getContext();
      },
    );

    expect(immediate).toEqual({ requestId: "config" });
    expect(seen).toEqual({ region: "eu", tenant: "acme" });
    expect(manager.getContext()).toEqual({ region: "eu", tenant: "acme" });
  });
});
