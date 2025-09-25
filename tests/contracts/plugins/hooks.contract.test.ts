import { describe, expect, it, vi } from "vitest";

import {
  buildPluginExecutionPlan,
  runAfterHooks,
  runBeforeHooks,
} from "../../../src/plugins/hooks/index.js";
import type {
  AfterLogHook,
  HookLogger,
  LogRecord,
  PluginRegistration,
} from "../../../src/core/types.js";
import { createLogRecord } from "../../fixtures/log-record.js";

describe("plugin hook contract", () => {
  it("orders before hooks and clones records on mutation", async () => {
    const order: string[] = [];
    const record = createLogRecord({ message: "base" });
    const registrations: PluginRegistration[] = [
      {
        name: "beta",
        stage: "before",
        order: 10,
        hook(context) {
          order.push("beta");
          context.setRecord({
            ...context.record,
            message: `${context.record.message}-beta`,
          });
        },
      },
      {
        name: "alpha",
        stage: "before",
        order: -5,
        hook(context) {
          order.push("alpha");
          context.setRecord({
            ...context.record,
            message: `${context.record.message}-alpha`,
          });
        },
      },
      {
        name: "disabled",
        stage: "before",
        enabled: false,
        hook: () => {
          throw new Error("should not run");
        },
      },
    ];

    const plan = buildPluginExecutionPlan(registrations);
    const telemetryLogger: HookLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await runBeforeHooks(plan.before, record, telemetryLogger);

    expect(order).toEqual(["alpha", "beta"]);
    expect(result.record.message).toBe("base-alpha-beta");
    expect(record.message).toBe("base");
    expect(result.telemetry.executed).toBe(2);
    expect(result.telemetry.failed).toBe(0);
    expect(telemetryLogger.warn).not.toHaveBeenCalled();
  });

  it("continues executing before hooks when one fails", async () => {
    const failure = new Error("hook failed");
    const registrations: PluginRegistration[] = [
      {
        name: "ok",
        stage: "before",
        hook(context) {
          context.setRecord({
            ...context.record,
            metadata: { ...context.record.metadata, ok: true },
          });
        },
      },
      {
        name: "broken",
        stage: "before",
        hook: () => {
          throw failure;
        },
      },
      {
        name: "last",
        stage: "before",
        hook(context) {
          context.setRecord({
            ...context.record,
            metadata: { ...context.record.metadata, last: true },
          });
        },
      },
    ];

    const plan = buildPluginExecutionPlan(registrations);
    const logger: HookLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await runBeforeHooks(plan.before, createLogRecord(), logger);

    expect(result.telemetry.executed).toBe(3);
    expect(result.telemetry.failed).toBe(1);
    expect(result.telemetry.errors[0]).toMatchObject({
      name: "broken",
      error: failure,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "before hook failed",
      expect.objectContaining({ hook: "broken", error: failure }),
    );
    expect(result.record.metadata).toMatchObject({ ok: true, last: true });
  });

  it("executes after hooks in order and collects failures", async () => {
    const callOrder: string[] = [];
    const failure = new Error("after broken");
    const afterHooks: PluginRegistration[] = [
      {
        name: "last",
        stage: "after",
        order: 5,
        hook: ((context) => {
          callOrder.push("last");
          expect(context.transportResults).toHaveLength(1);
        }) as AfterLogHook,
      },
      {
        name: "broken",
        stage: "after",
        order: 0,
        hook: () => {
          callOrder.push("broken");
          throw failure;
        },
      },
      {
        name: "first",
        stage: "after",
        order: -10,
        hook: ((context) => {
          callOrder.push("first");
          expect(context.record.message).toBe("after-record");
        }) as AfterLogHook,
      },
    ];

    const plan = buildPluginExecutionPlan(afterHooks);
    const logger: HookLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const logRecord: LogRecord = createLogRecord({ message: "after-record" });

    const telemetry = await runAfterHooks(
      plan.after,
      {
        record: logRecord,
        transportResults: [{ transportName: "memory", succeeded: true }],
      },
      logger,
    );

    expect(callOrder).toEqual(["first", "broken", "last"]);
    expect(telemetry.executed).toBe(3);
    expect(telemetry.failed).toBe(1);
    expect(telemetry.errors[0]).toMatchObject({
      name: "broken",
      error: failure,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "after hook failed",
      expect.objectContaining({ hook: "broken", error: failure }),
    );
  });
});
