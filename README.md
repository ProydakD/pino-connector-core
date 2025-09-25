# Pino Connector Core

[English](README.md) | [Русский](README.ru.md)

[![NPM version](https://img.shields.io/npm/v/pino-connector-core.svg?style=flat-square)](https://www.npmjs.com/package/pino-connector-core)
[![NPM downloads](https://img.shields.io/npm/dm/pino-connector-core.svg?style=flat-square)](https://www.npmjs.com/package/pino-connector-core)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-3C873A?style=flat-square)](https://nodejs.org/)
[![TypeScript Ready](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-FF8C00?style=flat-square)](https://pnpm.io/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

> **pino-connector-core** is the core engine for building custom logging solutions with [Pino](https://getpino.io/). It provides a reusable and configurable logging pipeline designed to work consistently across various environments like frameworks, background workers, and command-line interfaces.

> **pino-connector-core** is intentionally framework-agnostic. It does not include any framework-specific adapters. Instead, it provides a contract and a set of tools that enable other packages to implement connectors for specific frameworks (like NestJS, Express, Fastify, etc.) following a unified set of rules. This approach promotes consistency and reusability across the ecosystem.

## The Problem it Solves

Instead of repeatedly implementing transports, redaction rules, and diagnostics for each new service or tool, `pino-connector-core` allows you to configure a logging pipeline once and reuse it everywhere. This ensures consistency and saves development time.

### Key Features

- **Unified Transport Registry**: Manage built-in and custom logging destinations with safe lifecycle hooks.
- **Predictable Context Propagation**: Powered by `AsyncLocalStorage` for reliable context handling in asynchronous code.
- **Extensible Pipeline**: Use "before" and "after" plugins to enrich log records, and serializers to redact sensitive data.
- **Built-in Diagnostics**: Get a snapshot of transport health and performance, perfect for monitoring and debugging.

## Common Use Cases

| Scenario                 | Benefit                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Framework Adapters**   | Export a clean `createLogger()` API while the connector handles the complexity of transports and hooks. |
| **Multi-Team Platforms** | Enforce shared enrichment and redaction policies across all services.                                   |
| **Internal Tooling**     | Provide production-grade logging for CLIs and workers without duplicating infrastructure code.          |

## Quick Start

The following example demonstrates how to create a connector, add a transport, and log a message with context.

```ts
// Import necessary functions from the library
import { createConnector, stdoutTransport } from "pino-connector-core";

// Create a new connector instance
const connector = createConnector({
  // Register the built-in stdout transport
  transports: [stdoutTransport.registration],
  // Configure the initial context and enable async propagation
  context: { initial: { service: "api" }, propagateAsync: true },
});

// Create a logger instance from the connector
const logger = connector.createLogger();

// Run a function with additional context
connector.runWithContext({ requestId: "req-101" }, () => {
  // This log will include the service and requestId in its context
  logger.info("request accepted");
});
```

### Diagnostic Snapshots

You can get a snapshot of the connector's health, which is useful for monitoring.

```ts
// Get a snapshot of the connector's diagnostics
const diagnostics = connector.getDiagnosticsSnapshot();

// Log the status of the transports
console.log(diagnostics.transports);
```

## Practical Examples

### Enriching Records with a "Before" Plugin

Plugins can modify log records before they are sent to transports.

```ts
const connector = createConnector({
  plugins: [
    {
      name: "user-tag",
      stage: "before", // Run this plugin before the log is processed
      hook({ record, setRecord }) {
        // Extract the user ID from the log's metadata, or default to "anonymous"
        const userId = record.metadata?.data?.user?.id ?? "anonymous";
        // Add the userId to the log's context
        setRecord({ ...record, context: { ...record.context, userId } });
      },
    },
  ],
});

// This log will be enriched by the "user-tag" plugin
connector
  .getRootLogger()
  .info({ data: { user: { id: "42" } } }, "user logged in");
```

### Reacting to Transport Failures with an "After" Plugin

"After" plugins can react to the results of transport operations.

```ts
const connector = createConnector({
  transports: [stdoutTransport.registration],
  plugins: [
    {
      name: "metrics",
      stage: "after", // Run this plugin after the log has been sent to transports
      hook({ transportResults }) {
        // Iterate over the results from each transport
        for (const result of transportResults) {
          if (!result.succeeded) {
            // If a transport failed, log a warning
            console.warn("transport failure", result.transportName);
          }
        }
      },
    },
  ],
});
```

### Registering a Custom Transport

You can easily register your own custom transports.

```ts
// Register a custom transport that sends logs to an HTTP endpoint
await connector.registerTransport(
  // Provide a name and configuration for the transport
  { name: "log-api", config: { endpoint: "https://logs.example.com" } },
  // The factory function creates the transport instance
  async (registration, { selfLogger }) => ({
    // The publish method sends the log record to the destination
    async publish({ record }) {
      await fetch(registration.config.endpoint, {
        method: "POST",
        body: JSON.stringify(record),
        headers: { "content-type": "application/json" },
      });
    },
    // The shutdown method is called when the connector is shutting down
    async shutdown() {
      selfLogger.info({ transport: registration.name }, "log-api shutdown");
    },
  }),
);
```

## Documentation

For more detailed information, please refer to the documentation:

- [**Project Overview**](docs/en/index.md)
- [**Getting Started**](docs/en/getting-started.md)
- [**Configuration**](docs/en/configuration.md)
- **Extensibility**:
  - [Transports](docs/en/transports.md)
  - [Plugins and Hooks](docs/en/plugins.md)
  - [Serializers and Redaction](docs/en/serializers.md)
- **Operations**:
  - [Diagnostics](docs/en/diagnostics.md)
  - [Benchmarks](docs/en/benchmarks.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
