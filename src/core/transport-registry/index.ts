import {
  type DiagnosticsLogger,
  type LogLevelName,
  type LogMetadata,
  type LogRecord,
  type TransportFactory,
  type TransportLifecycle,
  type TransportRegistration
} from '../types.js';
import { normalizeConnectorConfig } from '../config/index.js';

export interface RegisteredTransport {
  readonly name: string;
  readonly level: LogLevelName | undefined;
  readonly lifecycle: TransportLifecycle;
  readonly registration: TransportRegistration;
}

export interface PublishResult {
  readonly transportName: string;
  readonly success: boolean;
  readonly error?: unknown;
}

export interface TransportRegistryDiagnostics {
  readonly transports: readonly RegisteredTransport[];
  readonly failures: readonly PublishResult[];
}

export interface TransportRegistry {
  register(registration: TransportRegistration, factory: TransportFactory): Promise<RegisteredTransport>;
  remove(name: string): Promise<void>;
  publish(record: LogRecord): Promise<PublishResult[]>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  getDiagnostics(): TransportRegistryDiagnostics;
  list(): readonly RegisteredTransport[];
}

export function createTransportRegistry(
  baseLogger: DiagnosticsLogger = createConsoleDiagnosticsLogger()
): TransportRegistry {
  const transports = new Map<string, RegisteredTransport>();
  const failures: PublishResult[] = [];

  return {
    async register(registration: TransportRegistration, factory: TransportFactory): Promise<RegisteredTransport> {
      const normalized = normalizeTransportRegistration(registration);
      const scopedLogger = createScopedDiagnosticsLogger(baseLogger, normalized.name);
      const lifecycle = await factory(normalized, { selfLogger: scopedLogger });
      const record: RegisteredTransport = {
        name: normalized.name,
        level: normalized.level,
        lifecycle,
        registration: normalized
      };

      const existing = transports.get(normalized.name);
      if (existing?.lifecycle.shutdown) {
        await Promise.resolve(existing.lifecycle.shutdown());
      }

      transports.set(normalized.name, record);
      return record;
    },
    async remove(name: string): Promise<void> {
      const existing = transports.get(name);
      if (!existing) {
        return;
      }
      transports.delete(name);
      if (existing.lifecycle.shutdown) {
        await Promise.resolve(existing.lifecycle.shutdown());
      }
    },
    async publish(record: LogRecord): Promise<PublishResult[]> {
      const results: PublishResult[] = [];
      for (const transport of transports.values()) {
        if (transport.level && !shouldLog(transport.level, record.level)) {
          continue;
        }

        try {
          await Promise.resolve(transport.lifecycle.publish({ record }));
          results.push({ transportName: transport.name, success: true });
        } catch (error) {
          const failure: PublishResult = { transportName: transport.name, success: false, error };
          results.push(failure);
          failures.push(failure);
          trimFailures(failures);
          if (transport.lifecycle.flush) {
            await Promise.resolve(transport.lifecycle.flush());
          }
        }
      }

      return results;
    },
    async flush(): Promise<void> {
      for (const transport of transports.values()) {
        if (transport.lifecycle.flush) {
          await Promise.resolve(transport.lifecycle.flush());
        }
      }
    },
    async shutdown(): Promise<void> {
      for (const transport of transports.values()) {
        if (transport.lifecycle.shutdown) {
          await Promise.resolve(transport.lifecycle.shutdown());
        }
      }
      transports.clear();
      failures.length = 0;
    },
    getDiagnostics(): TransportRegistryDiagnostics {
      return {
        transports: Array.from(transports.values()),
        failures: [...failures]
      };
    },
    list(): readonly RegisteredTransport[] {
      return Array.from(transports.values());
    }
  };
}

class InvalidTransportRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransportRegistrationError';
  }
}

function normalizeTransportRegistration(registration: TransportRegistration): TransportRegistration {
  const normalizedList = normalizeConnectorConfig({ transports: [registration] }).transports;
  const [normalized] = normalizedList;
  if (!normalized) {
    throw new InvalidTransportRegistrationError('Transport registration normalization yielded no result.');
  }
  return normalized;
}

function createScopedDiagnosticsLogger(base: DiagnosticsLogger, transportName: string): DiagnosticsLogger {
  const augmentMetadata = (metadata?: LogMetadata): LogMetadata => ({
    transport: transportName,
    ...(metadata ?? {})
  });

  return {
    info(message: string, metadata?: LogMetadata): void {
      base.info(message, augmentMetadata(metadata));
    },
    warn(message: string, metadata?: LogMetadata): void {
      base.warn(message, augmentMetadata(metadata));
    },
    error(message: string, metadata?: LogMetadata): void {
      base.error(message, augmentMetadata(metadata));
    }
  } satisfies DiagnosticsLogger;
}

function createConsoleDiagnosticsLogger(): DiagnosticsLogger {
  return {
    info(message: string, metadata?: LogMetadata): void {
      console.info('[transport]', message, metadata ?? {});
    },
    warn(message: string, metadata?: LogMetadata): void {
      console.warn('[transport]', message, metadata ?? {});
    },
    error(message: string, metadata?: LogMetadata): void {
      console.error('[transport]', message, metadata ?? {});
    }
  };
}

const LEVEL_RANK: Record<LogLevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70
};

function shouldLog(threshold: LogLevelName, level: LogLevelName): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold];
}

const MAX_FAILURES = 50;

function trimFailures(store: PublishResult[]): void {
  if (store.length > MAX_FAILURES) {
    store.splice(0, store.length - MAX_FAILURES);
  }
}