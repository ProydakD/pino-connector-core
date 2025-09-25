import {
  type CoreLogger,
  type DiagnosticsLogger,
  type LogBindings,
  type LogContext,
  type LogLevelName,
  type LogMetadata,
  type LogMethodArguments,
  type LogRecord,
  type PluginRegistration,
  type SerializerMap,
  type TransportFactory,
  type TransportRegistration,
} from "./types.js";
import {
  type ConnectorConfig,
  type ConnectorConfigInput,
  normalizeConnectorConfig,
} from "./config/index.js";
import { createAsyncContextManager } from "./context/async-storage.js";
import {
  createTransportRegistry,
  type RegisteredTransport,
  type TransportRegistry,
  type TransportRegistryDiagnostics,
} from "./transport-registry/index.js";
import {
  builtinTransports,
  registerBuiltinTransports,
} from "../transports/index.js";
import {
  mergeTransportFactories,
  type CustomTransportStore,
} from "../transports/custom/index.js";
import pino, {
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from "pino";

export type ConnectorState = "running" | "stopping" | "stopped";

export interface CreateConnectorOptions<
  TContext extends LogContext = LogContext,
> {
  readonly config?: ConnectorConfigInput;
  readonly pinoOptions?: PinoLoggerOptions;
  readonly logger?: PinoLogger;
  readonly contextProvider?: () => TContext;
  readonly transportFactories?: Record<string, TransportFactory>;
  readonly customTransports?: CustomTransportStore;
  readonly useBuiltinTransports?: boolean;
  readonly selfLogger?: DiagnosticsLogger;
}

export interface Connector<TContext extends LogContext = LogContext> {
  readonly state: ConnectorState;
  readonly config: ConnectorConfig;
  getRootLogger(): CoreLogger<TContext>;
  createLogger(bindings?: LogBindings): CoreLogger<TContext>;
  getRawLogger(): PinoLogger;
  getTransports(): readonly TransportRegistration[];
  getPlugins(): readonly PluginRegistration[];
  getSerializers(): SerializerMap;
  registerTransport(
    registration: TransportRegistration,
    factory: TransportFactory,
  ): Promise<void>;
  removeTransport(name: string): Promise<void>;
  listTransports(): readonly RegisteredTransport[];
  getTransportDiagnostics(): TransportRegistryDiagnostics;
  setLevel(level: LogLevelName): void;
  updateConfig(next: ConnectorConfigInput): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  getContext(): TContext;
  setContext(patch: Partial<TContext>): void;
  runWithContext<TReturn>(context: TContext, callback: () => TReturn): TReturn;
  runWithContext<TReturn>(
    context: TContext,
    callback: () => Promise<TReturn>,
  ): Promise<TReturn>;
  resetContext(): void;
}

export function createConnector<TContext extends LogContext = LogContext>(
  options: CreateConnectorOptions<TContext> = {},
): Connector<TContext> {
  let currentConfig = normalizeConnectorConfig(options.config);
  let currentState: ConnectorState = "running";

  const baseContext =
    options.contextProvider?.() ?? (currentConfig.context.initial as TContext);
  const contextManager = createAsyncContextManager<TContext>({
    initialContext: baseContext,
    propagateAsync: currentConfig.context.propagateAsync,
  });

  const rawLogger = initializeLogger(
    options.logger,
    options.pinoOptions,
    currentConfig.level,
  );
  const guard = createStateGuard(() => currentState);
  const applyLevel = (level: LogLevelName): void => {
    rawLogger.level = level;
    currentConfig = {
      ...currentConfig,
      level,
    };
  };
  const transportRegistry = createTransportRegistry(
    options.selfLogger ?? createTransportDiagnosticsLogger(rawLogger),
  );

  const customTransports = options.customTransports;
  let resolvedFactories = options.transportFactories;

  if (customTransports) {
    resolvedFactories = mergeTransportFactories(
      options.transportFactories ?? {},
      customTransports,
    );
    currentConfig = {
      ...currentConfig,
      transports: upsertTransports(
        currentConfig.transports,
        Array.from(customTransports.registrations.values()),
      ),
    };
  }

  void registerConfiguredTransports(
    () => currentConfig.transports,
    (nextTransports) => {
      currentConfig = {
        ...currentConfig,
        transports: nextTransports,
      };
    },
    resolvedFactories,
    transportRegistry,
    rawLogger,
  );

  if (options.useBuiltinTransports !== false) {
    void registerMissingBuiltinTransports(
      () => currentConfig.transports,
      (nextTransports) => {
        currentConfig = {
          ...currentConfig,
          transports: nextTransports,
        };
      },
      transportRegistry,
      rawLogger,
    );
  }

  const rootLogger = createCoreLogger(
    rawLogger,
    () => contextManager.getContext(),
    guard,
    applyLevel,
    transportRegistry,
    {},
  );

  const connector: Connector<TContext> = {
    get state(): ConnectorState {
      return currentState;
    },
    get config(): ConnectorConfig {
      return currentConfig;
    },
    getRootLogger(): CoreLogger<TContext> {
      guard();
      return rootLogger;
    },
    createLogger(bindings?: LogBindings): CoreLogger<TContext> {
      guard();
      if (!bindings || Object.keys(bindings).length === 0) {
        return rootLogger;
      }
      return rootLogger.bind(bindings);
    },
    getRawLogger(): PinoLogger {
      return rawLogger;
    },
    getTransports(): readonly TransportRegistration[] {
      return currentConfig.transports;
    },
    getPlugins(): readonly PluginRegistration[] {
      return currentConfig.plugins;
    },
    getSerializers(): SerializerMap {
      return currentConfig.serializers;
    },
    async registerTransport(
      registration: TransportRegistration,
      factory: TransportFactory,
    ): Promise<void> {
      guard();
      const registered = await transportRegistry.register(
        registration,
        factory,
      );
      currentConfig = {
        ...currentConfig,
        transports: upsertTransport(
          currentConfig.transports,
          registered.registration,
        ),
      };
    },
    async removeTransport(name: string): Promise<void> {
      guard();
      await transportRegistry.remove(name);
      currentConfig = {
        ...currentConfig,
        transports: currentConfig.transports.filter(
          (transport) => transport.name !== name,
        ),
      };
    },
    listTransports(): readonly RegisteredTransport[] {
      return transportRegistry.list();
    },
    getTransportDiagnostics(): TransportRegistryDiagnostics {
      return transportRegistry.getDiagnostics();
    },
    setLevel(level: LogLevelName): void {
      guard();
      applyLevel(level);
    },
    updateConfig(next: ConnectorConfigInput): void {
      guard();
      const mergedConfig = normalizeConnectorConfig({
        level: next.level ?? currentConfig.level,
        transports: next.transports ?? currentConfig.transports,
        plugins: next.plugins ?? currentConfig.plugins,
        serializers: next.serializers ?? currentConfig.serializers,
        context: next.context ?? {
          initial: currentConfig.context.initial,
          propagateAsync: currentConfig.context.propagateAsync,
        },
        diagnostics: next.diagnostics ?? {
          enabled: currentConfig.diagnostics.enabled,
        },
      });
      contextManager.configure({
        initialContext: mergedConfig.context.initial as TContext,
        propagateAsync: mergedConfig.context.propagateAsync,
      });
      currentConfig = mergedConfig;
      rawLogger.level = mergedConfig.level;
      void registerConfiguredTransports(
        () => currentConfig.transports,
        (nextTransports) => {
          currentConfig = {
            ...currentConfig,
            transports: nextTransports,
          };
        },
        options.transportFactories,
        transportRegistry,
        rawLogger,
      );
      if (options.useBuiltinTransports !== false) {
        void registerMissingBuiltinTransports(
          () => currentConfig.transports,
          (nextTransports) => {
            currentConfig = {
              ...currentConfig,
              transports: nextTransports,
            };
          },
          transportRegistry,
          rawLogger,
        );
      }
    },
    async flush(): Promise<void> {
      guard();
      await Promise.all([flushLogger(rawLogger), transportRegistry.flush()]);
    },
    async shutdown(): Promise<void> {
      if (currentState === "stopped") {
        return;
      }
      currentState = "stopping";
      await Promise.all([
        flushLogger(rawLogger),
        transportRegistry.shutdown(),
        closeLoggerTransport(rawLogger),
      ]);
      currentState = "stopped";
    },
    getContext(): TContext {
      guard();
      return contextManager.getContext();
    },
    setContext(patch: Partial<TContext>): void {
      guard();
      contextManager.setContext(patch);
    },
    runWithContext<TReturn>(
      context: TContext,
      callback: () => TReturn | Promise<TReturn>,
    ): TReturn | Promise<TReturn> {
      guard();
      return contextManager.runWithContext(context, callback);
    },
    resetContext(): void {
      guard();
      contextManager.resetContext();
    },
  };

  return connector;
}

function initializeLogger(
  providedLogger: PinoLogger | undefined,
  options: PinoLoggerOptions | undefined,
  level: LogLevelName,
): PinoLogger {
  if (providedLogger) {
    providedLogger.level = level;
    return providedLogger;
  }

  return pino({
    level,
    ...options,
  });
}

function createStateGuard(getState: () => ConnectorState): () => void {
  return () => {
    const state = getState();
    if (state === "stopped") {
      throw new ConnectorStoppedError("Connector has been shut down.");
    }
    if (state === "stopping") {
      throw new ConnectorStoppedError("Connector is shutting down.");
    }
  };
}

class ConnectorStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorStoppedError";
  }
}

class PinoCoreLogger<TContext extends LogContext>
  implements CoreLogger<TContext>
{
  public constructor(
    private readonly raw: PinoLogger,
    private readonly contextProvider: () => TContext,
    private readonly guard: () => void,
    private readonly onLevelChange: (level: LogLevelName) => void,
    private readonly transportRegistry: TransportRegistry,
    private readonly bindings: LogBindings,
  ) {}

  public get level(): LogLevelName {
    this.guard();
    return this.raw.level as LogLevelName;
  }

  public setLevel(level: LogLevelName): void {
    this.guard();
    this.onLevelChange(level);
  }

  public getContext(): TContext {
    return this.contextProvider();
  }

  public bind(bindings: LogBindings = {}): CoreLogger<TContext> {
    this.guard();
    const sanitizedBindings = { ...bindings };
    const child = this.raw.child(sanitizedBindings);
    return new PinoCoreLogger(
      child,
      this.contextProvider,
      this.guard,
      this.onLevelChange,
      this.transportRegistry,
      sanitizedBindings,
    );
  }

  public async flush(): Promise<void> {
    this.guard();
    await flushLogger(this.raw);
  }

  public log(level: LogLevelName, ...args: LogMethodArguments): void {
    this.guard();
    this.dispatch(level, args);
  }

  public fatal(...args: LogMethodArguments): void {
    this.log("fatal", ...args);
  }

  public error(...args: LogMethodArguments): void {
    this.log("error", ...args);
  }

  public warn(...args: LogMethodArguments): void {
    this.log("warn", ...args);
  }

  public info(...args: LogMethodArguments): void {
    this.log("info", ...args);
  }

  public debug(...args: LogMethodArguments): void {
    this.log("debug", ...args);
  }

  public trace(...args: LogMethodArguments): void {
    this.log("trace", ...args);
  }

  private dispatch(level: LogLevelName, args: LogMethodArguments): void {
    const [message, metadata] = args;
    const record = buildLogRecord(
      level,
      message,
      metadata,
      this.contextProvider,
      this.bindings,
    );
    void this.transportRegistry.publish(record).catch((error) => {
      this.raw.warn({ error }, "transport publish failed");
    });
    const payload = buildLogPayload(metadata, this.contextProvider);
    (
      this.raw as PinoLogger &
        Record<LogLevelName, (obj: object, msg: string) => void>
    )[level](payload, message);
  }
}

function createCoreLogger<TContext extends LogContext>(
  raw: PinoLogger,
  contextProvider: () => TContext,
  guard: () => void,
  onLevelChange: (level: LogLevelName) => void,
  transportRegistry: TransportRegistry,
  bindings: LogBindings,
): CoreLogger<TContext> {
  return new PinoCoreLogger(
    raw,
    contextProvider,
    guard,
    onLevelChange,
    transportRegistry,
    bindings,
  );
}

function buildLogPayload<TContext extends LogContext>(
  metadata: LogMetadata | undefined,
  contextProvider: () => TContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (!metadata) {
    const context = contextProvider();
    if (hasEntries(context)) {
      payload.context = { ...context };
    }
    return payload;
  }

  const { data, context, error, ...rest } = metadata;

  if (Object.keys(rest).length > 0) {
    Object.assign(payload, rest);
  }

  if (data && Object.keys(data).length > 0) {
    Object.assign(payload, data);
  }

  const resolvedContext = mergeContexts(contextProvider(), context);
  if (hasEntries(resolvedContext)) {
    payload.context = resolvedContext;
  }

  if (error !== undefined) {
    payload.error = error;
  }

  return payload;
}

function buildLogRecord<TContext extends LogContext>(
  level: LogLevelName,
  message: string,
  metadata: LogMetadata | undefined,
  contextProvider: () => TContext,
  bindings: LogBindings,
): LogRecord {
  const context = contextProvider();
  return {
    level,
    timestamp: Date.now(),
    message,
    bindings: { ...bindings },
    context: { ...context },
    metadata: metadata ? { ...metadata } : {},
  };
}

function mergeContexts<TContext extends LogContext>(
  base: TContext,
  override: LogContext | undefined,
): LogContext {
  const baseCopy = { ...base } as LogContext;
  if (!override || Object.keys(override).length === 0) {
    return baseCopy;
  }

  return {
    ...baseCopy,
    ...override,
  };
}

function hasEntries(value: LogContext | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

async function flushLogger(logger: PinoLogger): Promise<void> {
  if (typeof logger.flush === "function") {
    await Promise.resolve(logger.flush());
  }
}

async function closeLoggerTransport(logger: PinoLogger): Promise<void> {
  const transport = (
    logger as unknown as {
      transport?: { close?: () => unknown | Promise<unknown> };
    }
  ).transport;
  if (transport?.close) {
    await Promise.resolve(transport.close());
  }
}

function createTransportDiagnosticsLogger(
  logger: PinoLogger,
): DiagnosticsLogger {
  const scoped = logger.child({ subsystem: "transport-registry" });
  return {
    info(message: string, metadata?: LogMetadata): void {
      scoped.info(metadata ?? {}, message);
    },
    warn(message: string, metadata?: LogMetadata): void {
      scoped.warn(metadata ?? {}, message);
    },
    error(message: string, metadata?: LogMetadata): void {
      scoped.error(metadata ?? {}, message);
    },
  };
}

async function registerConfiguredTransports(
  getTransports: () => readonly TransportRegistration[],
  setTransports: (transports: readonly TransportRegistration[]) => void,
  factories: Record<string, TransportFactory> | undefined,
  registry: TransportRegistry,
  logger: PinoLogger,
): Promise<void> {
  if (!factories) {
    return;
  }

  const registrations = getTransports();
  for (const registration of registrations) {
    const factory = factories[registration.name];
    if (!factory) {
      continue;
    }
    try {
      const registered = await registry.register(registration, factory);
      setTransports(upsertTransport(getTransports(), registered.registration));
    } catch (error) {
      logger.warn(
        { error, transport: registration.name },
        "failed to register configured transport",
      );
    }
  }
}

async function registerMissingBuiltinTransports(
  getTransports: () => readonly TransportRegistration[],
  setTransports: (transports: readonly TransportRegistration[]) => void,
  registry: TransportRegistry,
  logger: PinoLogger,
): Promise<void> {
  const currentTransports = getTransports();
  const missing = builtinTransports.filter(
    (transport) =>
      !currentTransports.some(
        (existing) => existing.name === transport.registration.name,
      ),
  );

  if (missing.length === 0) {
    return;
  }

  try {
    await registerBuiltinTransports(registry, missing);
    const updated = Array.from(getTransports());
    for (const addition of missing.map((transport) => transport.registration)) {
      const index = updated.findIndex(
        (transport) => transport.name === addition.name,
      );
      if (index >= 0) {
        updated[index] = addition;
      } else {
        updated.push(addition);
      }
    }
    setTransports(updated);
  } catch (error) {
    logger.warn({ error }, "failed to register builtin transports");
  }
}

function upsertTransport(
  existing: readonly TransportRegistration[],
  next: TransportRegistration,
): readonly TransportRegistration[] {
  const filtered = existing.filter((transport) => transport.name !== next.name);
  return [...filtered, next];
}

function upsertTransports(
  existing: readonly TransportRegistration[],
  additions: readonly TransportRegistration[],
): readonly TransportRegistration[] {
  const result: TransportRegistration[] = [...existing];
  for (const addition of additions) {
    const index = result.findIndex(
      (transport) => transport.name === addition.name,
    );
    if (index >= 0) {
      result[index] = addition;
    } else {
      result.push(addition);
    }
  }
  return result;
}
