import { describe, expect, it, vi } from "vitest";

import {
  builtinTransports,
  registerBuiltinTransports,
} from "../../src/transports/index.js";
import type {
  TransportFactory,
  TransportRegistration,
} from "../../src/core/types.js";

describe("transports/index", () => {
  it("exports builtin transports", () => {
    expect(builtinTransports.length).toBeGreaterThan(0);
    builtinTransports.forEach((entry) => {
      expect(entry.registration.name).toBeDefined();
      expect(typeof entry.factory).toBe("function");
    });
  });

  it("registers builtin transports with provided registry", async () => {
    const register = vi.fn(async () => {});
    const registry = { register };
    const custom: Array<{
      registration: TransportRegistration;
      factory: TransportFactory;
    }> = [
      {
        registration: { name: "example", config: {} },
        factory: vi.fn(async () => ({ async publish() {} })),
      },
    ];

    await registerBuiltinTransports(registry, custom);

    expect(register).toHaveBeenCalledTimes(custom.length);
    expect(register).toHaveBeenCalledWith(
      custom[0]?.registration,
      custom[0]?.factory,
    );
  });
});
