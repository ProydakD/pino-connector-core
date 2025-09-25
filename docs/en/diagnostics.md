# Diagnostics

English | [Russian](../ru/diagnostics.md)

Diagnostics help you understand transport health and plugin behaviour without spamming application logs.

## Self Logger

Provide a custom diagnostics logger:

```ts
// You can provide a custom logger for the connector's internal diagnostics.
const connector = createConnector({
  selfLogger: {
    info: console.log, // Use console.log for info messages
    warn: console.warn, // Use console.warn for warnings
    error: console.error, // Use console.error for errors
  },
});
```

If omitted, the connector uses the root Pino logger with safeguards against infinite loops.

## Snapshots

```ts
// Get a snapshot of the current diagnostics.
const snapshot = connector.getDiagnosticsSnapshot();

// You can then inspect the state of the transports.
console.log(snapshot.transports);
```

Snapshots include connector state, transport health, and plugin/serializer error counters. Expose them via a health endpoint or dashboard.

## Transport Reporting

Transports can implement getDiagnostics() to supply custom fields (queue depth, retry counts, etc.). The connector merges them with internal error tracking.

## Troubleshooting Checklist

- Repeated transport warnings: check network connectivity or credentials.
- Rising serializer error counts: audit new fields hitting the pipeline.
- Plugin failures: ensure hooks guard against missing metadata.

