# HTTP Server Example

Starts a small Node.js HTTP server that attaches a per-request context, writes logs through the connector, and allows switching between stdout and an in-memory transport at runtime.

## Run

```bash
pnpm exec tsx examples/http-server/index.ts
```

- `GET /` � log a request with the current transport.
- `POST /switch?transport=memory` or `GET` � switch to the in-memory transport.
- `POST /switch?transport=stdout` � switch back to stdout.
- `GET /records` � inspect captured records when the memory transport is active.
