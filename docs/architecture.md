# Architecture Overview

## Vision

- Provide a framework-agnostic connector core that exposes a stable API for integrating Pino across runtimes and libraries.
- Keep the core small, dependency-light, and compatible with Node.js 18 and later.
- Preserve direct access to the underlying Pino logger while adding lifecycle, context, and extensibility primitives.

## High-Level Modules

- `src/core/`: contracts, configuration, logger factory, context, diagnostics, and transport registry.
- `src/transports/`: built-in transports (stdout baseline) and helpers for registering custom transports.
- `src/plugins/`: hooks and serializers that intercept log records before and after Pino serialization.
- `tests/`: mirrors the source tree with unit and contract suites plus fixtures for transports and context scenarios.
- `docs/`: design references and recipes that document public APIs and extension patterns.

## Core Components

### Logger Factory and Lifecycle

- Expose `createConnector` that bootstraps a root logger, registers transports, and returns helpers for child loggers.
- Allow hot swapping of log levels and transports without recreating the factory.
- Provide access to the raw Pino instance for escape hatches and advanced tuning.

### Context Management

- Use `AsyncLocalStorage` to manage request-level correlation IDs, user metadata, and arbitrary tags.
- Offer helpers to set/read context within execution scopes and automatically bind context to child loggers.
- Ensure context APIs remain framework-agnostic so adapters can integrate with their own middleware stacks.

### Transport Registry

- Define a `Transport` contract that normalizes init, publish, flush, and shutdown semantics.
- Maintain a registry that validates transports, handles dynamic registration/removal, and isolates failures per transport.
- Surface diagnostics (health checks, backpressure signals, error counters) through the registry for observability.

### Plugin Hooks

- Support before/after hooks that can mutate log payloads, enrich context, or redact sensitive fields.
- Enforce execution ordering and timeouts so slow plugins cannot block logging indefinitely.
- Guard against plugin failures by isolating exceptions and emitting diagnostics instead of breaking the pipeline.

### Serializers and Redaction

- Provide a serializer contract and utilities to drop or mask Personally Identifiable Information (PII).
- Supply default serializers for common fields while allowing custom per-transport overrides.
- Ensure serializer pipelines run prior to handing data to transports to enforce consistent sanitization.

### Diagnostics and Self-Logging

- Embed a self-logger that reports connector health, transport errors, and plugin failures without causing recursion.
- Expose health probes that adapters can poll to evaluate connectivity and queue depth.
- Track metrics such as dropped messages, retry counts, and context propagation failures.

## Data Flow

1. Application code requests a logger from the connector factory.
2. Logger emits a log payload merged with contextual data from `AsyncLocalStorage`.
3. Before-hooks mutate/enrich the payload.
4. Serializer pipeline redacts and normalizes the record.
5. After-hooks perform side effects (metrics, tracing) and hand the payload to the transport registry.
6. Registry fans out the record to registered transports and surfaces diagnostics for failures.

## Extensibility Strategy

- Publish TypeScript interfaces for loggers, transports, plugins, and serializers so third parties can implement adapters.
- Keep configuration shape declarative (objects, not globals) and validate via dedicated config module.
- Document lifecycle events and extension points in `docs/` and example projects.

## Testing and Quality Gates

- Mirror `src/` modules under `tests/` with Vitest suites targeting both happy path and failure scenarios.
- Add contract tests for transports/plugins using fixtures under `tests/fixtures/`.
- Track coverage via `pnpm run coverage` with a target of ≥90% lines and enforce via CI.
- Provide lightweight benchmarks under `pnpm run bench` to monitor overhead (<3% goal).

## Operational Considerations

- Deliver both ESM and CJS bundles via `tsup` builds for compatibility across toolchains.
- Avoid global singletons; allow multiple connector instances either per service or per environment.
- Expose safe defaults while permitting configuration of levels, serializers, transports, and diagnostics endpoints.
