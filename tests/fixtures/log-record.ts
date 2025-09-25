import { type LogLevelName, type LogRecord } from "../../src/core/types.js";

export function createLogRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  const level = overrides.level ?? "info";
  return {
    level: level as LogLevelName,
    timestamp: overrides.timestamp ?? Date.now(),
    message: overrides.message ?? "test-message",
    bindings: { ...(overrides.bindings ?? {}) },
    context: { ...(overrides.context ?? {}) },
    metadata: { ...(overrides.metadata ?? {}) },
  } satisfies LogRecord;
}
