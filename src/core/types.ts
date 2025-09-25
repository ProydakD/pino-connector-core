export type LogLevelName =
  | "silent"
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

export type LogMethodArguments = [message: string, metadata?: LogMetadata];

export interface LogMetadata {
  readonly error?: unknown;
  readonly context?: LogContext;
  readonly data?: Record<string, unknown> | undefined;
  readonly [key: string]: unknown;
}

export type LogContext = Record<string, unknown>;

export interface LogRecord {
  readonly level: LogLevelName;
  readonly timestamp: number;
  readonly message: string;
  readonly bindings: LogBindings;
  readonly context: LogContext;
  readonly metadata: LogMetadata;
}

export type LogBindings = Record<string, unknown>;

export interface LoggerMethods {
  fatal(...args: LogMethodArguments): void;
  error(...args: LogMethodArguments): void;
  warn(...args: LogMethodArguments): void;
  info(...args: LogMethodArguments): void;
  debug(...args: LogMethodArguments): void;
  trace(...args: LogMethodArguments): void;
  log(level: LogLevelName, ...args: LogMethodArguments): void;
}

export interface CoreLogger<TContext extends LogContext = LogContext>
  extends LoggerMethods {
  readonly level: LogLevelName;
  setLevel(level: LogLevelName): void;
  getContext(): TContext;
  bind(bindings: LogBindings): CoreLogger<TContext>;
  flush(): Promise<void>;
}

export interface LoggerFactory<TContext extends LogContext = LogContext> {
  createLogger(bindings?: LogBindings): CoreLogger<TContext>;
  getRawLogger(): unknown;
}

export interface TransportPublishPayload {
  readonly record: LogRecord;
}

export interface TransportLifecycle {
  publish(payload: TransportPublishPayload): Promise<void> | void;
  flush?(): Promise<void> | void;
  shutdown?(): Promise<void> | void;
  getDiagnostics?(): TransportDiagnostics;
}

export interface TransportDiagnostics {
  readonly isHealthy: boolean;
  readonly details?: Record<string, unknown>;
}

export interface TransportRegistration<TConfig = unknown> {
  readonly name: string;
  readonly level?: LogLevelName;
  readonly config: Readonly<TConfig>;
}

export interface TransportFactoryContext {
  readonly selfLogger: DiagnosticsLogger;
}

export type TransportFactory<TConfig = unknown> = (
  registration: TransportRegistration<TConfig>,
  context: TransportFactoryContext,
) => Promise<TransportLifecycle> | TransportLifecycle;

export interface DiagnosticsLogger {
  info(...args: LogMethodArguments): void;
  warn(...args: LogMethodArguments): void;
  error(...args: LogMethodArguments): void;
}

export interface BeforeLogHookContext {
  record: LogRecord;
  setRecord(next: LogRecord): void;
}

export type BeforeLogHook = (
  context: BeforeLogHookContext,
) => Promise<void> | void;

export interface AfterLogHookContext {
  readonly record: Readonly<LogRecord>;
  readonly transportResults: readonly TransportResult[];
}

export type AfterLogHook = (
  context: AfterLogHookContext,
) => Promise<void> | void;

export interface TransportResult {
  readonly transportName: string;
  readonly succeeded: boolean;
  readonly error?: unknown;
}

export interface PluginRegistration {
  readonly name: string;
  readonly stage: PluginStage;
  readonly hook: BeforeLogHook | AfterLogHook;
  readonly order?: number;
  readonly enabled?: boolean;
}

export type PluginStage = "before" | "after";

export interface SerializerContext {
  readonly record: LogRecord;
  readonly key: string;
  readonly value: unknown;
  redact(): void;
  replace(next: unknown): void;
}

export type Serializer = (context: SerializerContext) => Promise<void> | void;

export type SerializerMap = Record<string, Serializer>;

export interface ConnectorContracts {
  readonly loggerFactory: LoggerFactory;
  readonly transports: readonly TransportRegistration[];
  readonly plugins: readonly PluginRegistration[];
  readonly serializers: SerializerMap;
}
