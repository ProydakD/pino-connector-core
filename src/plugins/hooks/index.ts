import {
  type AfterLogHook,
  type AfterLogHookContext,
  type BeforeLogHook,
  type BeforeLogHookContext,
  type LogRecord,
  type PluginRegistration,
} from "../../core/types.js";

export interface HookErrorEntry {
  readonly name: string;
  readonly error: unknown;
}

export interface HookTelemetry {
  executed: number;
  failed: number;
  errors: HookErrorEntry[];
}

export interface HookPlan<T> {
  readonly name: string;
  readonly order: number;
  readonly hook: T;
}

export interface PluginExecutionPlan {
  readonly before: readonly HookPlan<BeforeLogHook>[];
  readonly after: readonly HookPlan<AfterLogHook>[];
}

export interface HookLogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function buildPluginExecutionPlan(
  registrations: readonly PluginRegistration[],
): PluginExecutionPlan {
  const before: HookPlan<BeforeLogHook>[] = [];
  const after: HookPlan<AfterLogHook>[] = [];

  for (const registration of registrations) {
    if (registration.enabled === false) {
      continue;
    }

    const entry = {
      name: registration.name,
      order: registration.order ?? 0,
    };

    if (registration.stage === "before") {
      before.push({ ...entry, hook: registration.hook as BeforeLogHook });
    } else {
      after.push({ ...entry, hook: registration.hook as AfterLogHook });
    }
  }

  before.sort((left, right) => left.order - right.order);
  after.sort((left, right) => left.order - right.order);

  return {
    before,
    after,
  } satisfies PluginExecutionPlan;
}

export async function runBeforeHooks(
  plan: readonly HookPlan<BeforeLogHook>[],
  record: LogRecord,
  logger?: HookLogger,
): Promise<{ record: LogRecord; telemetry: HookTelemetry }> {
  const telemetry: HookTelemetry = { executed: 0, failed: 0, errors: [] };
  let currentRecord = record;

  for (const { name, hook } of plan) {
    telemetry.executed += 1;
    try {
      currentRecord = await runBeforeHook(hook, currentRecord);
    } catch (error) {
      telemetry.failed += 1;
      telemetry.errors.push({ name, error });
      logger?.warn("before hook failed", { hook: name, error });
    }
  }

  return { record: currentRecord, telemetry };
}

export async function runAfterHooks(
  plan: readonly HookPlan<AfterLogHook>[],
  context: AfterLogHookContext,
  logger?: HookLogger,
): Promise<HookTelemetry> {
  const telemetry: HookTelemetry = { executed: 0, failed: 0, errors: [] };

  for (const { name, hook } of plan) {
    telemetry.executed += 1;
    try {
      await hook(context);
    } catch (error) {
      telemetry.failed += 1;
      telemetry.errors.push({ name, error });
      logger?.warn("after hook failed", { hook: name, error });
    }
  }

  return telemetry;
}

function runBeforeHook(
  hook: BeforeLogHook,
  record: LogRecord,
): Promise<LogRecord> | LogRecord {
  let nextRecord = record;
  const context: BeforeLogHookContext = {
    record,
    setRecord(updated: LogRecord) {
      nextRecord = { ...updated };
    },
  };

  const result = hook(context);
  if (result instanceof Promise) {
    return result.then(() => nextRecord);
  }

  return nextRecord;
}
