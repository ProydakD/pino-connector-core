import { once } from 'node:events';
import process from 'node:process';
import {
  type LogRecord,
  type TransportFactory,
  type TransportLifecycle,
  type TransportPublishPayload,
  type TransportRegistration
} from '../core/types.js';

export interface StdoutTransportConfig {
  readonly eol?: string;
}

export const createStdoutTransport: TransportFactory<StdoutTransportConfig> = (
  registration,
  { selfLogger }
) => {
  const stream = process.stdout;
  const eol = registration.config?.eol ?? '\n';

  const lifecycle: TransportLifecycle = {
    async publish(payload: TransportPublishPayload): Promise<void> {
      const line = formatRecord(payload.record, eol);
      if (!stream.write(line)) {
        try {
          await once(stream, 'drain');
        } catch (error) {
          selfLogger.error('stdout transport drain failed', { error });
        }
      }
    },
    async flush(): Promise<void> {
      const flushCandidate = stream as unknown as { flush?: () => void };
      if (typeof flushCandidate.flush === 'function') {
        try {
          flushCandidate.flush();
        } catch (error) {
          selfLogger.warn('stdout transport flush raised error', { error });
        }
      }
    }
  };

  selfLogger.info('stdout transport initialized', {
    eol
  });

  return lifecycle;
};

function formatRecord(record: LogRecord, eol: string): string {
  const payload = {
    level: record.level,
    time: record.timestamp,
    msg: record.message,
    bindings: record.bindings,
    context: record.context,
    metadata: record.metadata
  } satisfies Record<string, unknown>;

  return `${JSON.stringify(payload)}${eol}`;
}

export function registerStdoutTransport(registry: {
  register(registration: TransportRegistration, factory: TransportFactory): Promise<unknown>;
}): Promise<unknown> {
  const registration: TransportRegistration<StdoutTransportConfig> = {
    name: 'stdout',
    config: {
      eol: '\n'
    }
  };

  return registry.register(registration, createStdoutTransport as TransportFactory);
}