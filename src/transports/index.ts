import {
  type TransportFactory,
  type TransportRegistration,
} from "../core/types.js";
import { createStdoutTransport } from "./stdout.js";

export interface BuiltinTransportRegistration {
  readonly registration: TransportRegistration;
  readonly factory: TransportFactory;
}

export const builtinTransports: readonly BuiltinTransportRegistration[] = [
  {
    registration: {
      name: "stdout",
      config: {
        eol: "\n",
      },
    },
    factory: createStdoutTransport as TransportFactory,
  },
];

export async function registerBuiltinTransports(
  registry: {
    register(
      registration: TransportRegistration,
      factory: TransportFactory,
    ): Promise<unknown>;
  },
  transports: readonly BuiltinTransportRegistration[] = builtinTransports,
): Promise<void> {
  for (const transport of transports) {
    await registry.register(transport.registration, transport.factory);
  }
}
