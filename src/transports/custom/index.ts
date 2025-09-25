import {
  type TransportFactory,
  type TransportRegistration
} from '../../core/types.js';

export interface CustomTransportEntry {
  readonly registration: TransportRegistration;
  readonly factory: TransportFactory;
}

export interface CustomTransportStore {
  readonly factories: ReadonlyMap<string, TransportFactory>;
  readonly registrations: ReadonlyMap<string, TransportRegistration>;
  register(entry: CustomTransportEntry): void;
  registerAll(entries: readonly CustomTransportEntry[]): void;
  unregister(name: string): void;
  clear(): void;
  toTransportFactoryMap(): Record<string, TransportFactory>;
  list(): readonly CustomTransportEntry[];
}

export function createCustomTransportStore(): CustomTransportStore {
  const factoryMap = new Map<string, TransportFactory>();
  const registrationMap = new Map<string, TransportRegistration>();

  return {
    get factories(): ReadonlyMap<string, TransportFactory> {
      return factoryMap;
    },
    get registrations(): ReadonlyMap<string, TransportRegistration> {
      return registrationMap;
    },
    register(entry: CustomTransportEntry): void {
      validateEntry(entry);
      factoryMap.set(entry.registration.name, entry.factory);
      registrationMap.set(entry.registration.name, entry.registration);
    },
    registerAll(entries: readonly CustomTransportEntry[]): void {
      entries.forEach((entry) => this.register(entry));
    },
    unregister(name: string): void {
      factoryMap.delete(name);
      registrationMap.delete(name);
    },
    clear(): void {
      factoryMap.clear();
      registrationMap.clear();
    },
    toTransportFactoryMap(): Record<string, TransportFactory> {
      return Object.fromEntries(factoryMap.entries());
    },
    list(): readonly CustomTransportEntry[] {
      return Array.from(registrationMap.entries()).map(([name, registration]) => ({
        registration,
        factory: factoryMap.get(name) as TransportFactory
      }));
    }
  } satisfies CustomTransportStore;
}

export function mergeTransportFactories(
  base: Record<string, TransportFactory> | undefined,
  store: CustomTransportStore
): Record<string, TransportFactory> {
  return {
    ...(base ?? {}),
    ...store.toTransportFactoryMap()
  };
}

function validateEntry(entry: CustomTransportEntry): void {
  if (!entry.registration?.name) {
    throw new Error('Custom transport registration must include a name.');
  }
  if (typeof entry.factory !== 'function') {
    throw new Error(`Custom transport "${entry.registration.name}" must include a factory function.`);
  }
}

/**
 * Example:
 *
 * ```ts
 * const store = createCustomTransportStore();
 * store.register({
 *   registration: { name: 'batch', config: { size: 10 } },
 *   factory: createBatchingTransport
 * });
 * const connector = createConnector({
 *   transportFactories: mergeTransportFactories(undefined, store),
 *   config: { transports: Array.from(store.registrations.values()) }
 * });
 * ```
 */
export type CustomTransportExample = void;