# Plugins and Hooks

English | [Russian](../ru/plugins.md)

Plugins add logic around the logging pipeline.

## Before Hooks

- Receive { record, setRecord }
- Can mutate the record by calling setRecord(nextRecord)
- Execute in ascending order

```ts
// This plugin adds a request ID to each log record.
const beforePlugin = {
  name: "request-id",
  stage: "before", // Run before the log is processed.
  order: 10, // The execution order of the plugin.
  hook({ record, setRecord }) {
    // Add a random UUID as the request ID to the context.
    setRecord({
      ...record,
      context: { ...record.context, requestId: crypto.randomUUID() },
    });
  },
};
```

## After Hooks

- Receive { record, transportResults }
- Ideal for metrics or tracing
- Execute in descending order

```ts
// This plugin increments a metric when a transport fails.
const afterPlugin = {
  name: "metrics",
  stage: "after", // Run after the log has been sent to transports.
  hook({ transportResults }) {
    // Iterate over the results from each transport.
    for (const result of transportResults) {
      if (!result.succeeded) {
        // If a transport failed, increment a metric.
        metrics.increment("logs.dropped", { transport: result.transportName });
      }
    }
  },
};
```

## Error Handling

- Exceptions are caught and routed to the diagnostics logger.
- The pipeline continues with remaining plugins.
- Disable a plugin by setting enabled: false.

## Testing

- Unit tests live under tests/plugins/hooks/.
- Integration coverage exists in tests/core/connector.test.ts.
- Add regression tests when introducing new ordering rules or side effects.
