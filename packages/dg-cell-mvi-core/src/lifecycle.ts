/**
 * Ordered, idempotent disposer collection. It is engine-agnostic and has no signal/stream
 * dependency.
 */

export type Disposer = () => void;

export interface Lifecycle {
  /** Register a disposer. If already disposed, runs it immediately. Returns an un-register handle. */
  add(disposer: Disposer): Disposer;
  dispose(): void;
  readonly disposed: boolean;
}

export function createLifecycle(): Lifecycle {
  const disposers = new Set<Disposer>();
  let disposed = false;

  function add(disposer: Disposer): Disposer {
    if (typeof disposer !== 'function') return () => {};
    if (disposed) {
      disposer();
      return () => {};
    }
    disposers.add(disposer);
    return () => {
      disposers.delete(disposer);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    Array.from(disposers).forEach((disposer) => {
      try {
        disposer();
      } finally {
        disposers.delete(disposer);
      }
    });
  }

  return {
    add,
    dispose,
    get disposed() {
      return disposed;
    },
  };
}
