import { describe, expect, it, vi } from "vitest";

import {
  hasSerializers,
  runSerializers,
} from "../../../src/plugins/serializers/index.js";
import type { LogRecord } from "../../../src/core/types.js";

describe("hasSerializers", () => {
  it("returns false for empty map", () => {
    expect(hasSerializers({})).toBe(false);
  });

  it("returns true when map has entries", () => {
    const serializers = {
      message: () => {},
    };
    expect(hasSerializers(serializers)).toBe(true);
  });
});

describe("runSerializers", () => {
  it("returns original record when no serializers provided", async () => {
    const record = createRecord({ metadata: { audit: {} } });

    const result = await runSerializers({}, record);

    expect(result.record).toBe(record);
    expect(result.telemetry).toEqual({
      executed: 0,
      redacted: 0,
      replaced: 0,
      failed: 0,
      errors: [],
    });
  });

  it("replaces nested metadata value", async () => {
    const record = createRecord({
      metadata: { user: { email: "user@example.com" } },
    });

    const result = await runSerializers(
      {
        "metadata.user.email": (context) => {
          context.replace("[REDACTED]");
        },
      },
      record,
    );

    expect(result.record).not.toBe(record);
    expect(result.record.metadata).toMatchObject({
      user: { email: "[REDACTED]" },
    });
    expect(result.telemetry).toMatchObject({
      executed: 1,
      replaced: 1,
      redacted: 0,
      failed: 0,
    });
  });

  it("redacts metadata field", async () => {
    const record = createRecord({
      metadata: { secret: "token" },
    });

    const result = await runSerializers(
      {
        "metadata.secret": (context) => {
          context.redact();
        },
      },
      record,
    );

    expect(result.record.metadata).not.toHaveProperty("secret");
    expect(result.telemetry).toMatchObject({
      redacted: 1,
      replaced: 0,
      failed: 0,
    });
  });

  it("creates intermediate containers when replacing path", async () => {
    const record = createRecord({ metadata: { audit: {} } });

    const result = await runSerializers(
      {
        "metadata.audit.traceId": (context) => {
          context.replace("trace-123");
        },
      },
      record,
    );

    expect(result.record.metadata).toMatchObject({
      audit: { traceId: "trace-123" },
    });
    expect(result.telemetry.replaced).toBe(1);
  });

  it("removes array entries when redacted", async () => {
    const record = createRecord({
      metadata: { tokens: ["keep", "drop", "stay"] },
    });

    const result = await runSerializers(
      {
        "metadata.tokens.1": (context) => {
          context.redact();
        },
      },
      record,
    );

    expect(result.record.metadata).toMatchObject({ tokens: ["keep", "stay"] });
    expect(result.telemetry.redacted).toBe(1);
  });

  it("skips serializers when path cannot be resolved", async () => {
    const record = createRecord({
      metadata: { count: 10 },
    });

    const result = await runSerializers(
      {
        "metadata.count.value": (context) => {
          context.replace(0);
        },
      },
      record,
    );

    expect(result.record.metadata).toMatchObject({ count: 10 });
    expect(result.telemetry).toMatchObject({
      executed: 1,
      replaced: 0,
      redacted: 0,
      failed: 0,
    });
  });

  it("captures failures and logs warning", async () => {
    const record = createRecord({
      metadata: { foo: "bar" },
    });
    const warn = vi.fn();
    const error = vi.fn();
    const logger = { warn, error } as const;

    const result = await runSerializers(
      {
        "metadata.foo": () => {
          throw new Error("boom");
        },
      },
      record,
      logger,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe("serializer failed");
    expect(error).not.toHaveBeenCalled();
    expect(result.telemetry.failed).toBe(1);
    expect(result.telemetry.errors[0]?.key).toBe("metadata.foo");
  });
});

function createRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    level: "info",
    timestamp: 1_700_000_000_000,
    message: "test",
    bindings: {},
    context: {},
    metadata: {},
    ...overrides,
  };
}
