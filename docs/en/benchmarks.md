# Benchmarks

English | [Russian](../ru/benchmarks.md)

The connector ships with a tinybench script that ensures the logging pipeline stays within a 3 percent overhead budget versus raw Pino.

## Run the Guardrail

```bash
pnpm run bench
```

Sample output:

`pino-baseline: 620000.00 ops/sec
connector    : 2750000.00 ops/sec
overhead     : 0.00% (target 3.00%)`

The script lives at benchmarks/connector.ts. It builds a baseline logger that writes to a dev-null stream and compares it with a connector instance using an in-memory transport.

## When Things Slow Down

- Audit recent changes to hooks or serializers.
- Ensure transports do not perform blocking I/O in publish during benchmarking.
- Increase BENCH_DURATION_MS to reduce variance on unstable environments.

## Extending Benchmarks

Duplicate the script for additional scenarios (multiple transports, heavy serializers) to capture targeted regressions.
