import {
  type LogRecord,
  type SerializerContext,
  type SerializerMap,
} from "../../core/types.js";

export interface SerializerErrorEntry {
  readonly key: string;
  readonly error: unknown;
}

export interface SerializerTelemetry {
  executed: number;
  redacted: number;
  replaced: number;
  failed: number;
  errors: SerializerErrorEntry[];
}

export interface SerializerLogger {
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function hasSerializers(serializers: SerializerMap): boolean {
  return Object.keys(serializers).length > 0;
}

export async function runSerializers(
  serializers: SerializerMap,
  record: LogRecord,
  logger?: SerializerLogger,
): Promise<{ record: LogRecord; telemetry: SerializerTelemetry }> {
  const entries = Object.entries(serializers);
  if (entries.length === 0) {
    return { record, telemetry: createTelemetry() };
  }

  let currentRecord = cloneRecord(record);
  const telemetry = createTelemetry();

  for (const [key, serializer] of entries) {
    telemetry.executed += 1;
    const segments = getPathSegments(key);
    const context = createSerializerContext(
      currentRecord,
      key,
      segments,
      telemetry,
    );

    if (!context) {
      continue;
    }

    try {
      const result = serializer(context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      telemetry.failed += 1;
      telemetry.errors.push({ key, error });
      logger?.warn("serializer failed", { serializer: key, error });
    }

    currentRecord = context.record as MutableLogRecord;
  }

  return { record: currentRecord, telemetry };
}

function createTelemetry(): SerializerTelemetry {
  return {
    executed: 0,
    redacted: 0,
    replaced: 0,
    failed: 0,
    errors: [],
  };
}

type MutableLogRecord = {
  -readonly [K in keyof LogRecord]: LogRecord[K];
};

function cloneRecord(record: LogRecord): MutableLogRecord {
  const cloned: MutableLogRecord = {
    ...record,
    bindings: { ...record.bindings },
    context: { ...record.context },
    metadata: { ...record.metadata },
  };

  const metadata = cloned.metadata as Record<string, unknown>;
  if (isRecord(metadata.data)) {
    metadata.data = { ...metadata.data };
  }
  if (isRecord(metadata.context)) {
    metadata.context = { ...metadata.context };
  }

  return cloned;
}

function createSerializerContext(
  record: MutableLogRecord,
  key: string,
  segments: readonly string[],
  telemetry: SerializerTelemetry,
): SerializerContext | undefined {
  if (segments.length === 0) {
    return undefined;
  }
  const parentSegments = segments.slice(0, -1);
  const parent = getByPath(record, parentSegments);
  if (!isContainer(parent) && segments.length > 1) {
    return undefined;
  }

  return {
    record: record as LogRecord,
    key,
    get value(): unknown {
      return getByPath(record, segments);
    },
    redact(): void {
      if (deleteByPath(record, segments)) {
        telemetry.redacted += 1;
      }
    },
    replace(next: unknown): void {
      setByPath(record, segments, next);
      telemetry.replaced += 1;
    },
  } satisfies SerializerContext;
}

function getPathSegments(path: string): string[] {
  return path.split(".").filter(Boolean);
}

function getByPath(target: unknown, segments: readonly string[]): unknown {
  let current = target;
  for (const segment of segments) {
    current = accessProperty(current, segment);
    if (current === undefined || current === null) {
      return current;
    }
  }
  return current;
}

function setByPath(
  target: unknown,
  segments: readonly string[],
  value: unknown,
): void {
  if (segments.length === 0) {
    return;
  }

  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      return;
    }
    let next = accessProperty(current, segment);
    if (!isContainer(next)) {
      next = {};
      assignProperty(current, segment, next);
    }
    current = next;
  }

  const finalSegment = segments[segments.length - 1];
  if (finalSegment === undefined) {
    return;
  }
  assignProperty(current, finalSegment, value);
}

function deleteByPath(target: unknown, segments: readonly string[]): boolean {
  if (segments.length === 0) {
    return false;
  }

  const parentSegments = segments.slice(0, -1);
  const property = segments[segments.length - 1];
  if (property === undefined) {
    return false;
  }
  const parent = getByPath(target, parentSegments);
  if (!isContainer(parent)) {
    return false;
  }

  if (Array.isArray(parent)) {
    const index = toArrayIndex(property);
    if (index === undefined || index < 0 || index >= parent.length) {
      return false;
    }
    parent.splice(index, 1);
    return true;
  }

  const container = parent as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(container, property)) {
    delete container[property];
    return true;
  }

  return false;
}

function accessProperty(target: unknown, segment: string): unknown {
  if (Array.isArray(target)) {
    const index = toArrayIndex(segment);
    return index === undefined ? undefined : target[index];
  }
  if (isRecord(target)) {
    return target[segment];
  }
  return undefined;
}

function assignProperty(
  target: unknown,
  segment: string,
  value: unknown,
): void {
  if (Array.isArray(target)) {
    const index = toArrayIndex(segment);
    if (index !== undefined) {
      (target as unknown[])[index] = value;
    }
    return;
  }
  if (isRecord(target)) {
    const container = target as Record<string, unknown>;
    container[segment] = value;
  }
}

function toArrayIndex(segment: string): number | undefined {
  if (!/^\d+$/.test(segment)) {
    return undefined;
  }
  const index = Number.parseInt(segment, 10);
  return Number.isNaN(index) ? undefined : index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContainer(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isRecord(value);
}
