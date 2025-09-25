import { describe, expect, it } from "vitest";

import {
  InvalidConnectorConfigError,
  normalizeConnectorConfig,
} from "../../../src/core/config/index.js";
import type { Serializer } from "../../../src/core/types.js";

describe("normalizeConnectorConfig", () => {
  it("accepts serializer map with functions", () => {
    const serializer: Serializer = () => {};
    const input = { serializers: { user: serializer } } as const;

    const config = normalizeConnectorConfig(input);

    expect(config.serializers).not.toBe(input.serializers);
    expect(config.serializers.user).toBe(serializer);
  });

  it("throws when serializer value is not a function", () => {
    expect(() =>
      normalizeConnectorConfig({
        serializers: { user: true as unknown as Serializer },
      }),
    ).toThrow(InvalidConnectorConfigError);
  });

  it("applies defaults for missing optional fields", () => {
    const config = normalizeConnectorConfig();

    expect(config.level).toBe("info");
    expect(config.transports).toEqual([]);
    expect(config.plugins).toEqual([]);
    expect(config.serializers).toEqual({});
    expect(config.context).toMatchObject({
      propagateAsync: true,
    });
    expect(config.diagnostics.enabled).toBe(true);
  });

  it("validates transport registrations", () => {
    expect(() =>
      normalizeConnectorConfig({ transports: {} as unknown as [] }),
    ).toThrowError(/`transports` must be an array/);

    expect(() =>
      normalizeConnectorConfig({
        transports: [
          {
            name: "",
            config: {},
          },
        ],
      }),
    ).toThrowError(/must define a non-empty string name/);

    expect(() =>
      normalizeConnectorConfig({
        transports: [
          {
            name: "memory",
          } as unknown as { name: string; config: never },
        ],
      }),
    ).toThrowError(/must provide a config object/);
  });

  it("validates plugins and context", () => {
    expect(() =>
      normalizeConnectorConfig({
        plugins: [
          {
            name: "bad",
            stage: "during" as "before",
            hook() {},
          },
        ],
      }),
    ).toThrowError(/stage as 'before' or 'after'/);

    expect(() =>
      normalizeConnectorConfig({ context: { initial: 42 } as never }),
    ).toThrowError(/`context.initial` must be a plain object/);

    expect(() =>
      normalizeConnectorConfig({ diagnostics: { enabled: "no" as never } }),
    ).toThrowError(/`diagnostics.enabled` must be a boolean/);
  });

  it("accepts plugins with ordering and filtering", () => {
    const config = normalizeConnectorConfig({
      plugins: [
        { name: "beta", stage: "before", order: 5, hook() {} },
        { name: "alpha", stage: "after", enabled: false, hook() {} },
      ],
    });

    expect(config.plugins).toHaveLength(2);
    expect(config.plugins[0]?.name).toBe("beta");
  });

  it("throws on unknown log level", () => {
    expect(() =>
      normalizeConnectorConfig({ level: "verbose" as never }),
    ).toThrow("Unknown log level");
  });
});
