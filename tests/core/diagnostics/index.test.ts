import { describe, expect, it } from "vitest";

import {
  buildConnectorDiagnosticsSnapshot,
  createPluginDiagnosticsLogger,
  createSerializerDiagnosticsLogger,
  createTransportDiagnosticsLogger,
  isConnectorHealthy,
} from "../../../src/core/diagnostics/index.js";
import type { RegisteredTransport } from "../../../src/core/transport-registry/index.js";
import type {
  LogLevelName,
  LogMetadata,
  TransportDiagnostics,
  TransportLifecycle,
  TransportRegistration,
  TransportResult,
} from "../../../src/core/types.js";
import type { Logger as PinoLogger } from "pino";

describe("buildConnectorDiagnosticsSnapshot", () => {
  it("marks snapshot healthy when transports report healthy and no failures", () => {
    const transports = [createRegisteredTransport("stdout")];
    const snapshot = buildConnectorDiagnosticsSnapshot({
      transports,
      failures: [],
    });

    expect(snapshot.status).toBe("healthy");
    expect(snapshot.transports).toHaveLength(1);
    expect(snapshot.transports[0]!).toMatchObject({
      name: "stdout",
      healthy: true,
      failureCount: 0,
    });
    expect(isConnectorHealthy(snapshot)).toBe(true);
  });

  it("marks snapshot degraded when failures recorded", () => {
    const error = new Error("boom");
    const transports = [createRegisteredTransport("stdout")];
    const failures: TransportResult[] = [
      { transportName: "stdout", succeeded: false, error },
    ];

    const snapshot = buildConnectorDiagnosticsSnapshot({
      transports,
      failures,
    });

    expect(snapshot.status).toBe("degraded");
    const entry = snapshot.transports[0]!;
    expect(entry.failureCount).toBe(1);
    expect(entry.lastError).toBe(error);
    expect(isConnectorHealthy(snapshot)).toBe(false);
  });

  it("uses transport diagnostics health flag", () => {
    const transports = [
      createRegisteredTransport("http", {
        diagnostics: { isHealthy: false },
      }),
    ];

    const snapshot = buildConnectorDiagnosticsSnapshot({
      transports,
      failures: [],
    });

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.transports[0]!).toMatchObject({ healthy: false });
  });

  it("captures diagnostics errors when transport.getDiagnostics throws", () => {
    const diagnosticsError = new Error("unreachable");
    const transports = [
      createRegisteredTransport("queue", {
        diagnosticsError,
      }),
    ];

    const snapshot = buildConnectorDiagnosticsSnapshot({
      transports,
      failures: [],
    });

    expect(snapshot.status).toBe("degraded");
    expect(snapshot.transports[0]!).toMatchObject({
      healthy: false,
      diagnosticsError,
    });
  });
});

describe("diagnostic loggers", () => {
  it("routes transport diagnostics through scoped logger", () => {
    const stub = createStubPinoLogger();
    const logger = createTransportDiagnosticsLogger(stub.logger);

    logger.warn("transport warning", { foo: "bar" });

    expect(stub.calls).toEqual([
      {
        level: "warn",
        message: "transport warning",
        metadata: { foo: "bar" },
        bindings: { subsystem: "transport-registry" },
      },
    ]);
  });

  it("routes plugin diagnostics", () => {
    const stub = createStubPinoLogger();
    const logger = createPluginDiagnosticsLogger(stub.logger);

    logger.warn("hook warning");

    expect(stub.calls[0]).toMatchObject({
      level: "warn",
      message: "hook warning",
      bindings: { subsystem: "plugin-hooks" },
      metadata: {},
    });
  });

  it("routes serializer diagnostics", () => {
    const stub = createStubPinoLogger();
    const logger = createSerializerDiagnosticsLogger(stub.logger);

    logger.error("serializer failure", { detail: true });

    expect(stub.calls[0]).toEqual({
      level: "error",
      message: "serializer failure",
      metadata: { detail: true },
      bindings: { subsystem: "serializers" },
    });
  });
});

function createRegisteredTransport(
  name: string,
  options: {
    level?: LogLevelName;
    diagnostics?: TransportDiagnostics;
    diagnosticsError?: unknown;
  } = {},
): RegisteredTransport {
  const lifecycle: TransportLifecycle = {
    async publish() {
      // no-op
    },
  };

  if (options.diagnostics) {
    lifecycle.getDiagnostics = () =>
      options.diagnostics as TransportDiagnostics;
  }

  if (options.diagnosticsError) {
    lifecycle.getDiagnostics = () => {
      throw options.diagnosticsError;
    };
  }

  const registration: TransportRegistration = {
    name,
    config: {} as const,
    ...(options.level !== undefined ? { level: options.level } : {}),
  };

  return {
    name,
    level: options.level,
    lifecycle,
    registration,
  } as RegisteredTransport;
}

function createStubPinoLogger(): {
  readonly logger: PinoLogger;
  readonly calls: ReadonlyArray<DiagnosticCall>;
} {
  const calls: DiagnosticCall[] = [];
  const child = (bindings: Record<string, unknown>) => ({
    info(metadata: LogMetadata | undefined, message: string) {
      calls.push({
        level: "info",
        message,
        metadata: metadata ?? {},
        bindings,
      });
    },
    warn(metadata: LogMetadata | undefined, message: string) {
      calls.push({
        level: "warn",
        message,
        metadata: metadata ?? {},
        bindings,
      });
    },
    error(metadata: LogMetadata | undefined, message: string) {
      calls.push({
        level: "error",
        message,
        metadata: metadata ?? {},
        bindings,
      });
    },
  });

  const logger = {
    child,
  } as unknown as PinoLogger;

  return { logger, calls };
}

type DiagnosticCall = {
  readonly level: "info" | "warn" | "error";
  readonly message: string;
  readonly metadata: LogMetadata;
  readonly bindings: Record<string, unknown>;
};
