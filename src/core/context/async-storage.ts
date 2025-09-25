import { AsyncLocalStorage } from "node:async_hooks";
import { type LogContext } from "../types.js";

export interface AsyncContextOptions<TContext extends LogContext> {
  readonly initialContext: TContext;
  readonly propagateAsync: boolean;
}

export interface AsyncContextManager<TContext extends LogContext> {
  getContext(): TContext;
  setContext(patch: Partial<TContext>): void;
  runWithContext<TReturn>(context: TContext, callback: () => TReturn): TReturn;
  runWithContext<TReturn>(
    context: TContext,
    callback: () => Promise<TReturn>,
  ): Promise<TReturn>;
  resetContext(): void;
  configure(options: AsyncContextOptions<TContext>): void;
}

export function createAsyncContextManager<TContext extends LogContext>(
  options: AsyncContextOptions<TContext>,
): AsyncContextManager<TContext> {
  let initialContext = cloneContext(options.initialContext);
  let propagateAsync = options.propagateAsync;
  let fallbackContext = cloneContext(initialContext);
  const storage = new AsyncLocalStorage<TContext>();

  const readActiveContext = (): TContext => {
    if (propagateAsync) {
      const store = storage.getStore();
      return store ?? fallbackContext;
    }

    return fallbackContext;
  };

  const writeContext = (next: TContext): void => {
    fallbackContext = next;
    if (propagateAsync) {
      storage.enterWith(next);
    }
  };

  return {
    getContext(): TContext {
      return cloneContext(readActiveContext());
    },
    setContext(patch: Partial<TContext>): void {
      const next = {
        ...readActiveContext(),
        ...patch,
      } as TContext;
      writeContext(cloneContext(next));
    },
    runWithContext<TReturn>(
      context: TContext,
      callback: () => TReturn | Promise<TReturn>,
    ): TReturn | Promise<TReturn> {
      const next = cloneContext(context);
      if (propagateAsync) {
        return storage.run(next, callback);
      }

      const previous = fallbackContext;
      fallbackContext = next;
      try {
        return callback();
      } finally {
        fallbackContext = previous;
      }
    },
    resetContext(): void {
      const next = cloneContext(initialContext);
      writeContext(next);
    },
    configure(newOptions: AsyncContextOptions<TContext>): void {
      initialContext = cloneContext(newOptions.initialContext);
      propagateAsync = newOptions.propagateAsync;
      const next = cloneContext(initialContext);
      fallbackContext = next;
      if (propagateAsync) {
        storage.disable();
        storage.run(next, () => {
          /* no-op */
        });
      } else {
        storage.disable();
      }
    },
  } satisfies AsyncContextManager<TContext>;
}

function cloneContext<TContext extends LogContext>(
  context: TContext,
): TContext {
  return { ...context } as TContext;
}
