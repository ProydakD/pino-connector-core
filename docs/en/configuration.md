# Configuration Reference

English | [Russian](../ru/configuration.md)

createConnector accepts a configuration object that can be provided up front or through connector.updateConfig(). Fields not specified fall back to safe defaults.

## Top-Level Structure

```ts
// The main configuration interface for the connector
interface ConnectorConfigInput {
  // The minimum log level to process.
  level?: LogLevelName;
  // An array of transports to register at startup.
  transports?: TransportRegistration[];
  // An array of plugins (hooks) to register.
  plugins?: PluginRegistration[];
  // A map of serializers for redacting or modifying log fields.
  serializers?: SerializerMap;
  // Configuration for the async context.
  context?: ConnectorContextConfigInput;
  // Configuration for the internal diagnostics logger.
  diagnostics?: ConnectorDiagnosticsConfigInput;
}
```

### level

- Default: info
- Matches Pino levels (silent, fatal, error, warn, info, debug, trace)
- Update at runtime via connector.setLevel()

### transports

Declare initial transports. Each entry must include name and config. Optional level overrides the minimum level for that transport.

Add or remove transports later with connector.registerTransport() and connector.removeTransport().

### plugins

List before or after hooks that mutate or observe log records. Use enabled: false to keep a plugin registered but inactive. See [plugins.md](plugins.md) for execution rules.

### serializers

Provide a map keyed by record property names. Serializers can redact or replace values before transports run. Covered in [serializers.md](serializers.md).

### context

Control AsyncLocalStorage behaviour:

- initial: base object available to every logger
- propagateAsync: defaults to true. Disable if you manage context manually.

### diagnostics

Enable or disable connector self-logging. Even when disabled, you can still call connector.getDiagnosticsSnapshot().

## Updating Configuration

```ts
// You can update the configuration at runtime.
connector.updateConfig({
  // Change the log level to "debug".
  level: "debug",
  // Replace the existing plugins with a new array.
  plugins: [...],
});
```

Only the provided fields are replaced. Existing transports remain registered unless removed explicitly.

## Error Handling

Invalid input triggers InvalidConnectorConfigError. Typical causes:

- Non-object configuration input
- Missing transport name or config
- Plugin without a function hook
- Serializer map containing non-function values

Wrap user input validation in adapters to surface clearer messages for consumers.

