import { describe, expect, it } from "vitest";

import {
  createCustomTransportStore,
  mergeTransportFactories,
} from "../../src/transports/custom/index.js";
import type {
  CustomTransportEntry,
  TransportFactory,
} from "../../src/core/types.js";

const noopFactory: TransportFactory = async () => ({
  async publish() {
    // noop
  },
});

describe("custom transport store", () => {
  it("registers transports and exposes factory map", () => {
    const store = createCustomTransportStore();
    const entry: CustomTransportEntry = {
      registration: { name: "alpha", config: {} },
      factory: noopFactory,
    };

    store.register(entry);

    expect(store.registrations.get("alpha")).toEqual(entry.registration);
    expect(store.factories.get("alpha")).toBe(noopFactory);
    expect(store.list()).toEqual([entry]);

    const merged = mergeTransportFactories({ existing: noopFactory }, store);
    expect(merged.alpha).toBe(noopFactory);
    expect(merged.existing).toBe(noopFactory);
  });

  it("supports registerAll, unregister and clear", () => {
    const store = createCustomTransportStore();
    const beta: CustomTransportEntry = {
      registration: { name: "beta", config: {} },
      factory: noopFactory,
    };
    const gamma: CustomTransportEntry = {
      registration: { name: "gamma", config: {} },
      factory: noopFactory,
    };

    store.registerAll([beta, gamma]);
    expect(store.list()).toHaveLength(2);

    store.unregister("beta");
    expect(store.list()).toEqual([gamma]);

    store.clear();
    expect(store.list()).toEqual([]);
    expect(store.factories.size).toBe(0);
    expect(store.registrations.size).toBe(0);
  });

  it("validates entry before registration", () => {
    const store = createCustomTransportStore();

    expect(() =>
      store.register({
        registration: { name: "delta", config: {} },
        // @ts-expect-error invalid factory
        factory: undefined,
      }),
    ).toThrowError('Custom transport "delta" must include a factory function.');

    expect(() =>
      store.register({
        // @ts-expect-error missing name
        registration: { name: "", config: {} },
        factory: noopFactory,
      }),
    ).toThrowError("Custom transport registration must include a name.");
  });
});
