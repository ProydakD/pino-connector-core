# Getting Started

English | [Russian](../ru/getting-started.md)

## Prerequisites

- Node.js 18 or newer
- pnpm 9.x
- Familiarity with TypeScript fundamentals

Check versions:

```bash
node --version
pnpm --version
```

## Install Dependencies

```bash
git clone <repo-url>
cd pino-connector-core
pnpm install
```

## Build and Test

```bash
pnpm run build
pnpm run test
```

Use pnpm run test:watch while iterating.

## Create Your First Connector

```ts
// Import the necessary functions from the library.
import { createConnector, stdoutTransport } from "pino-connector-core";

// Create a new connector instance.
const connector = createConnector({
  // Register the built-in stdout transport.
  transports: [stdoutTransport.registration],
  // Set an initial context and enable async propagation.
  context: { initial: { service: "demo" }, propagateAsync: true },
});

// Create a logger from the connector.
const logger = connector.createLogger();

// Log a message.
logger.info("connector online");
```

## Next Steps

- Explore configuration options in [configuration.md](configuration.md).
- Register custom transports following [transports.md](transports.md).
- Wire before and after hooks with [plugins.md](plugins.md).
- Run the performance guardrail described in [benchmarks.md](benchmarks.md).

