# Transports

English | [Russian](../ru/transports.md)

## Registering Transports

```ts
// Register a custom transport that sends logs to an HTTP endpoint.
await connector.registerTransport(
  // Provide a name and configuration for the transport.
  { name: "http", config: { endpoint: "https://logs.example.com" } },
  // The factory function creates the transport instance.
  async (registration, { selfLogger }) => ({
    // The `publish` method is called for each log record.
    async publish({ record }) {
      await fetch(registration.config.endpoint, {
        method: "POST",
        body: JSON.stringify(record),
        headers: { "content-type": "application/json" },
      });
    },
    // The `shutdown` method is called when the connector is shutting down.
    async shutdown() {
      selfLogger.info({ transport: registration.name }, "http transport down");
    },
  }),
);
```

- registration.name must be unique
- registration.level (optional) sets a minimum severity for that transport
- Factory receives a diagnostics logger for safe self-reporting

## Lifecycle Hooks

Transports may implement:

- publish(payload) (required)
- flush() (optional)
- shutdown() (optional)
- getDiagnostics() (optional, returns { isHealthy, details })

The connector calls flush() during connector.flush() and both flush() and shutdown() during connector.shutdown().

## Builtin Transports

The package includes a stdout transport. Disable automatic registration by passing useBuiltinTransports: false to createConnector if you want a custom-only setup.

## Diagnostics

Transport errors are captured and logged via the diagnostics logger. Results are aggregated into connector.getDiagnosticsSnapshot() so you can expose transport health in a monitoring endpoint.

## Testing Strategies

- Use fixtures from tests/fixtures/ to simulate success and failure cases.
- Verify diagnostics output when transports throw or return unhealthy status.
- Cover backpressure and concurrency scenarios relevant to your adapters.
