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
});
