# Serializers and Redaction

English | [Russian](../ru/serializers.md)

Serializers modify or remove specific fields before transports receive the record.

## Declaring Serializers

```ts
// Define a map of serializers.
const serializers = {
  // The "password" serializer removes the "password" field from the log record.
  password(context) {
    context.redact();
  },
  // The "token" serializer replaces the "token" field with a redacted value.
  token(context) {
    const value = String(context.value);
    context.replace("***");
  },
};

// Create a connector with the defined serializers.
const connector = createConnector({ serializers });
```

## Context Object

Each serializer receives:

- record: the full record snapshot
- key: the property name
- value: current value
- redact(): remove the key
- replace(next): set a new value

## Best Practices

- Keep logic synchronous and lightweight.
- Use before hooks to reshape nested data into predictable locations.
- Log serializer failures through diagnostics when investigating unexpected payloads.

## Testing

See tests/plugins/serializers/index.test.ts for reference patterns. Add additional cases for new keys or complex transformations.

