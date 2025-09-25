import { Bench } from "tinybench";
import { Writable } from "node:stream";
import pino, { type Logger as PinoLogger } from "pino";
import {
  createConnector,
  type CoreLogger,
  type DiagnosticsLogger,
  type TransportFactory,
  type TransportRegistration,
} from "../src/index.js";

const TARGET_OVERHEAD = 0.03;
const BENCH_DURATION_MS = 1000;
const WARMUP_ITERATIONS = 200;
const MESSAGE = "benchmark message";

interface BenchmarkSetup {
  readonly directLogger: PinoLogger;
  readonly connectorLogger: CoreLogger;
  readonly shutdown: () => Promise<void>;
}

const noop = (): void => {};

const silentDiagnosticsLogger: DiagnosticsLogger = {
  info: noop,
  warn: noop,
  error: noop,
};

const memoryTransportRegistration: TransportRegistration<
  Record<string, never>
> = {
  name: "memory",
  config: Object.freeze({}),
} as const;

const memoryTransportFactory: TransportFactory<Record<string, never>> = () => ({
  publish: () => {
    /* noop */
  },
});

function createDevNullLogger(): PinoLogger {
  const stream = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  return pino(
    {
      level: "info",
      base: null,
      timestamp: false,
    },
    stream,
  );
}

function createMetadata() {
  return {
    context: {
      requestId: "req-123",
      userId: 42,
      feature: "benchmark",
    },
    data: {
      success: true,
      attempt: 3,
      payload: {
        id: "42",
        nested: { count: 5, list: ["a", "b", "c"] },
      },
    },
  };
}

async function setupBenchmark(): Promise<BenchmarkSetup> {
  const directLogger = createDevNullLogger();
  const connector = createConnector({
    useBuiltinTransports: false,
    logger: createDevNullLogger(),
    selfLogger: silentDiagnosticsLogger,
  });

  await connector.registerTransport(
    memoryTransportRegistration,
    memoryTransportFactory,
  );

  return {
    directLogger,
    connectorLogger: connector.getRootLogger(),
    shutdown: async () => {
      await connector.shutdown();
      await flushLogger(directLogger);
    },
  } satisfies BenchmarkSetup;
}

async function flushLogger(logger: PinoLogger): Promise<void> {
  const candidate = logger as unknown as {
    flush?: () => unknown | Promise<unknown>;
    transport?: { close?: () => unknown | Promise<unknown> };
  };

  if (typeof candidate.flush === "function") {
    await candidate.flush();
  }

  if (candidate.transport?.close) {
    await candidate.transport.close();
  }
}

function collectHz(taskName: string, bench: Bench) {
  const task = bench.tasks.find((entry) => entry.name === taskName);
  if (!task || !task.result) {
    throw new Error(`Benchmark task '${taskName}' did not complete.`);
  }
  return task.result.hz;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function run(): Promise<void> {
  const { directLogger, connectorLogger, shutdown } = await setupBenchmark();
  const bench = new Bench({
    time: BENCH_DURATION_MS,
    iterations: 0,
    warmupIterations: WARMUP_ITERATIONS,
  });

  bench.add("pino-baseline", () => {
    const metadata = createMetadata();
    directLogger.info(metadata, MESSAGE);
  });

  bench.add("connector", () => {
    const metadata = createMetadata();
    connectorLogger.info(MESSAGE, metadata);
  });

  await bench.warmup();
  await bench.run();

  const baselineHz = collectHz("pino-baseline", bench);
  const connectorHz = collectHz("connector", bench);
  const overhead = Math.max(0, (baselineHz - connectorHz) / baselineHz);

  console.log(`pino-baseline: ${baselineHz.toFixed(2)} ops/sec`);
  console.log(`connector    : ${connectorHz.toFixed(2)} ops/sec`);
  console.log(
    `overhead     : ${formatPercent(overhead)} (target ${formatPercent(TARGET_OVERHEAD)})`,
  );

  if (!Number.isFinite(baselineHz) || baselineHz === 0) {
    throw new Error("Baseline benchmark produced invalid throughput.");
  }

  if (overhead > TARGET_OVERHEAD) {
    throw new Error(
      `Connector overhead ${formatPercent(overhead)} exceeds target ${formatPercent(TARGET_OVERHEAD)}.`,
    );
  }

  await shutdown();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
