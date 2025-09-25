import type {
  DiagnosticsLogger,
  LogLevelName,
  LogMetadata,
  TransportDiagnostics,
  TransportResult,
} from "../types.js";
import type {
  RegisteredTransport,
  TransportRegistryDiagnostics,
} from "../transport-registry/index.js";
import type { HookLogger } from "../types.js";
import type { SerializerLogger } from "../../plugins/serializers/index.js";
import type { Logger as PinoLogger } from "pino";

export type ConnectorHealthStatus = "healthy" | "degraded";

export interface TransportHealthSnapshot {
  readonly name: string;
  readonly level: LogLevelName | undefined;
  readonly healthy: boolean;
  readonly failureCount: number;
  readonly lastError?: unknown;
  readonly diagnostics?: TransportDiagnostics;
  readonly diagnosticsError?: unknown;
}

export interface ConnectorDiagnosticsSnapshot {
  readonly status: ConnectorHealthStatus;
  readonly transports: readonly TransportHealthSnapshot[];
  readonly failures: readonly TransportResult[];
}

export function createTransportDiagnosticsLogger(
  logger: PinoLogger,
): DiagnosticsLogger {
  return createDiagnosticsLogger(logger, { subsystem: "transport-registry" });
}

export function createPluginDiagnosticsLogger(logger: PinoLogger): HookLogger {
  const scoped = createDiagnosticsLogger(logger, { subsystem: "plugin-hooks" });
  return {
    warn(message: string, context?: Record<string, unknown>): void {
      scoped.warn(message, context);
    },
    error(message: string, context?: Record<string, unknown>): void {
      scoped.error(message, context);
    },
  } satisfies HookLogger;
}

export function createSerializerDiagnosticsLogger(
  logger: PinoLogger,
): SerializerLogger {
  const scoped = createDiagnosticsLogger(logger, { subsystem: "serializers" });
  return {
    warn(message: string, context?: Record<string, unknown>): void {
      scoped.warn(message, context);
    },
    error(message: string, context?: Record<string, unknown>): void {
      scoped.error(message, context);
    },
  } satisfies SerializerLogger;
}

export function buildConnectorDiagnosticsSnapshot(
  diagnostics: TransportRegistryDiagnostics,
): ConnectorDiagnosticsSnapshot {
  const failureCounts = new Map<string, number>();
  const lastErrors = new Map<string, unknown>();

  for (const failure of diagnostics.failures) {
    const current = failureCounts.get(failure.transportName) ?? 0;
    failureCounts.set(failure.transportName, current + 1);
    if (failure.error !== undefined) {
      lastErrors.set(failure.transportName, failure.error);
    }
  }

  const transports = diagnostics.transports.map((transport) =>
    buildTransportHealthSnapshot(
      transport,
      failureCounts.get(transport.name) ?? 0,
      lastErrors.get(transport.name),
    ),
  );

  const status = transports.every((entry) => entry.healthy)
    ? "healthy"
    : "degraded";

  return {
    status,
    transports,
    failures: diagnostics.failures,
  } satisfies ConnectorDiagnosticsSnapshot;
}

export function isConnectorHealthy(
  snapshot: ConnectorDiagnosticsSnapshot,
): boolean {
  return snapshot.status === "healthy";
}

function buildTransportHealthSnapshot(
  transport: RegisteredTransport,
  failureCount: number,
  lastError: unknown,
): TransportHealthSnapshot {
  let diagnostics: TransportDiagnostics | undefined;
  let diagnosticsError: unknown;

  if (typeof transport.lifecycle.getDiagnostics === "function") {
    try {
      diagnostics = transport.lifecycle.getDiagnostics();
    } catch (error) {
      diagnosticsError = error;
    }
  }

  const healthy =
    failureCount === 0 &&
    diagnosticsError === undefined &&
    (diagnostics?.isHealthy ?? true);

  return {
    name: transport.name,
    level: transport.level,
    healthy,
    failureCount,
    ...(lastError !== undefined ? { lastError } : {}),
    ...(diagnostics !== undefined ? { diagnostics } : {}),
    ...(diagnosticsError !== undefined ? { diagnosticsError } : {}),
  } satisfies TransportHealthSnapshot;
}

function createDiagnosticsLogger(
  logger: PinoLogger,
  bindings: Record<string, unknown>,
): DiagnosticsLogger {
  const child =
    typeof logger.child === "function" ? logger.child(bindings) : logger;
  return {
    info(message: string, metadata?: LogMetadata): void {
      (child as PinoChildLogger).info(metadata ?? {}, message);
    },
    warn(message: string, metadata?: LogMetadata): void {
      (child as PinoChildLogger).warn(metadata ?? {}, message);
    },
    error(message: string, metadata?: LogMetadata): void {
      (child as PinoChildLogger).error(metadata ?? {}, message);
    },
  } satisfies DiagnosticsLogger;
}

type PinoChildLogger = {
  info(obj: LogMetadata | undefined, msg: string): void;
  warn(obj: LogMetadata | undefined, msg: string): void;
  error(obj: LogMetadata | undefined, msg: string): void;
};
