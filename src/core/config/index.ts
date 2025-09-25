import {
  type LogContext,
  type LogLevelName,
  type PluginRegistration,
  type Serializer,
  type SerializerMap,
  type TransportRegistration,
} from "../types.js";

export interface ConnectorConfigInput {
  readonly level?: LogLevelName;
  readonly transports?: readonly TransportRegistration[];
  readonly plugins?: readonly PluginRegistration[];
  readonly serializers?: SerializerMap;
  readonly context?: ConnectorContextConfigInput;
  readonly diagnostics?: ConnectorDiagnosticsConfigInput;
}

export interface ConnectorContextConfigInput {
  readonly initial?: LogContext;
  readonly propagateAsync?: boolean;
}

export interface ConnectorDiagnosticsConfigInput {
  readonly enabled?: boolean;
}

export interface ConnectorConfig {
  readonly level: LogLevelName;
  readonly transports: readonly TransportRegistration[];
  readonly plugins: readonly PluginRegistration[];
  readonly serializers: SerializerMap;
  readonly context: ConnectorContextConfig;
  readonly diagnostics: ConnectorDiagnosticsConfig;
}

export interface ConnectorContextConfig {
  readonly initial: LogContext;
  readonly propagateAsync: boolean;
}

export interface ConnectorDiagnosticsConfig {
  readonly enabled: boolean;
}

export class InvalidConnectorConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidConnectorConfigError";
  }
}

const DEFAULT_LEVEL: LogLevelName = "info";
const ALLOWED_LEVELS: readonly LogLevelName[] = [
  "silent",
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
];

export function normalizeConnectorConfig(
  input: ConnectorConfigInput = {},
): ConnectorConfig {
  if (!isPlainObject(input)) {
    throw new InvalidConnectorConfigError(
      "Provide a plain object for connector configuration.",
    );
  }

  const level = input.level ?? DEFAULT_LEVEL;
  assertLogLevel(level);

  const transports = normalizeTransports(
    input.transports as ConnectorConfigInput["transports"],
  );
  const plugins = normalizePlugins(
    input.plugins as ConnectorConfigInput["plugins"],
  );
  const serializers = normalizeSerializers(
    input.serializers as ConnectorConfigInput["serializers"],
  );
  const context = normalizeContext(
    input.context as ConnectorContextConfigInput,
  );
  const diagnostics = normalizeDiagnostics(
    input.diagnostics as ConnectorDiagnosticsConfigInput,
  );

  return {
    level,
    transports,
    plugins,
    serializers,
    context,
    diagnostics,
  } satisfies ConnectorConfig;
}

function normalizeTransports(
  value: ConnectorConfigInput["transports"],
): readonly TransportRegistration[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new InvalidConnectorConfigError(
      "`transports` must be an array of transport registrations.",
    );
  }

  value.forEach((registration, index) => {
    if (!isPlainObject(registration)) {
      throw new InvalidConnectorConfigError(
        `Transport at index ${index} must be a plain object.`,
      );
    }

    const { name, level, config } = registration;

    if (typeof name !== "string" || name.length === 0) {
      throw new InvalidConnectorConfigError(
        `Transport at index ${index} must define a non-empty string name.`,
      );
    }

    if (level !== undefined) {
      assertLogLevel(level);
    }

    if (config === undefined) {
      throw new InvalidConnectorConfigError(
        `Transport at index ${index} must provide a config object.`,
      );
    }
  });

  return value;
}

function normalizePlugins(
  value: ConnectorConfigInput["plugins"],
): readonly PluginRegistration[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new InvalidConnectorConfigError(
      "`plugins` must be an array of plugin registrations.",
    );
  }

  value.forEach((registration, index) => {
    if (!isPlainObject(registration)) {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must be a plain object.`,
      );
    }

    const { name, stage, hook, order, enabled } = registration;

    if (stage !== "before" && stage !== "after") {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must define stage as 'before' or 'after'.`,
      );
    }

    if (typeof name !== "string" || name.length === 0) {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must define a non-empty string name.`,
      );
    }

    if (typeof hook !== "function") {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must provide a function hook.`,
      );
    }

    if (order !== undefined && typeof order !== "number") {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must specify 'order' as a number when provided.`,
      );
    }

    if (enabled !== undefined && typeof enabled !== "boolean") {
      throw new InvalidConnectorConfigError(
        `Plugin at index ${index} must specify 'enabled' as a boolean when provided.`,
      );
    }
  });

  return value;
}

function normalizeSerializers(
  value: ConnectorConfigInput["serializers"],
): SerializerMap {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new InvalidConnectorConfigError(
      "`serializers` must be an object with serializer functions.",
    );
  }

  const serializers: SerializerMap = {};
  Object.entries(value as Record<string, unknown>).forEach(
    ([key, serializer]) => {
      if (typeof serializer !== "function") {
        throw new InvalidConnectorConfigError(
          `Serializer for key "${key}" must be a function.`,
        );
      }

      serializers[key] = serializer as Serializer;
    },
  );

  return serializers;
}

function normalizeContext(
  value: ConnectorConfigInput["context"],
): ConnectorContextConfig {
  if (value === undefined) {
    return {
      initial: {},
      propagateAsync: true,
    } satisfies ConnectorContextConfig;
  }

  if (!isPlainObject(value)) {
    throw new InvalidConnectorConfigError("`context` must be a plain object.");
  }

  const candidate = value as ConnectorContextConfigInput;
  const initial = candidate.initial ?? {};
  if (!isPlainObject(initial)) {
    throw new InvalidConnectorConfigError(
      "`context.initial` must be a plain object.",
    );
  }

  const propagateAsync = candidate.propagateAsync ?? true;
  if (typeof propagateAsync !== "boolean") {
    throw new InvalidConnectorConfigError(
      "`context.propagateAsync` must be a boolean.",
    );
  }

  return {
    initial: initial as LogContext,
    propagateAsync,
  } satisfies ConnectorContextConfig;
}

function normalizeDiagnostics(
  value: ConnectorConfigInput["diagnostics"],
): ConnectorDiagnosticsConfig {
  if (value === undefined) {
    return { enabled: true } satisfies ConnectorDiagnosticsConfig;
  }

  if (!isPlainObject(value)) {
    throw new InvalidConnectorConfigError(
      "`diagnostics` must be a plain object.",
    );
  }

  const candidate = value as ConnectorDiagnosticsConfigInput;
  const enabled = candidate.enabled ?? true;
  if (typeof enabled !== "boolean") {
    throw new InvalidConnectorConfigError(
      "`diagnostics.enabled` must be a boolean.",
    );
  }

  return { enabled } satisfies ConnectorDiagnosticsConfig;
}

function assertLogLevel(level: unknown): asserts level is LogLevelName {
  if (
    typeof level !== "string" ||
    !ALLOWED_LEVELS.includes(level as LogLevelName)
  ) {
    throw new InvalidConnectorConfigError(
      `Unknown log level: ${String(level)}`,
    );
  }
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
