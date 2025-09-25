import {
  type TransportFactory,
  type TransportPublishPayload,
} from "../../src/core/types.js";

export interface MemoryTransportOptions {
  readonly failOnPublish?: Error;
}

export interface MemoryTransportFixture {
  readonly factory: TransportFactory;
  readonly records: TransportPublishPayload["record"][];
  getFlushCount(): number;
  getShutdownCount(): number;
}

export function createMemoryTransportFixture(
  options: MemoryTransportOptions = {},
): MemoryTransportFixture {
  const records: TransportPublishPayload["record"][] = [];
  let flushCount = 0;
  let shutdownCount = 0;

  const factory: TransportFactory = async (registration, { selfLogger }) => {
    selfLogger.info("memory transport ready", {
      transport: registration.name,
    });

    return {
      async publish(payload) {
        if (options.failOnPublish) {
          selfLogger.error("memory transport publish failed", {
            error: options.failOnPublish,
          });
          throw options.failOnPublish;
        }

        records.push(payload.record);
        selfLogger.info("memory transport published", {
          buffered: records.length,
        });
      },
      async flush() {
        flushCount += 1;
        selfLogger.info("memory transport flushed", {
          buffered: records.length,
        });
      },
      async shutdown() {
        shutdownCount += 1;
        records.length = 0;
        selfLogger.info("memory transport shutdown", {});
      },
      getDiagnostics() {
        return {
          isHealthy: options.failOnPublish === undefined,
          details: {
            buffered: records.length,
          },
        };
      },
    };
  };

  return {
    factory,
    records,
    getFlushCount: () => flushCount,
    getShutdownCount: () => shutdownCount,
  } satisfies MemoryTransportFixture;
}
