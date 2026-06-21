export function reduceCounter(state, event) {
  if (event?.type === 'counter.increment') {
    const step = Number(event.payload?.step ?? 1);
    return { count: Number(state?.count ?? 0) + step };
  }
  return state;
}

export function projectCounter(state) {
  const count = Number(state?.count ?? 0);
  return {
    value: count,
    label: `count = ${count}`,
  };
}

export function createCounterRuntime(_hostRuntime, _assembly, config) {
  let state = {
    count: Number(config?.count ?? 0),
  };

  const runtime = {
    kind: 'CounterRuntime',
    scopeId: 'counter-base',
    get viewModel() {
      return projectCounter(state);
    },
    dispatch(event) {
      state = reduceCounter(state, event);
      return runtime.viewModel;
    },
    call(name, input, callConfig) {
      if (name === 'counter.increment') {
        return runtime.dispatch({
          type: 'counter.increment',
          payload: { step: Number(callConfig?.step ?? input?.step ?? 1) },
        });
      }
      throw new Error(`Unknown counter runtime message: ${name}`);
    },
    deriveScope(assembly) {
      return deriveCounterRuntime(runtime, assembly, assembly?.config);
    },
  };

  return runtime;
}

export function deriveCounterRuntime(prototype, assembly, _config) {
  return {
    ...prototype,
    scopeId: assembly?.scopeId ?? 'counter-page',
    bindings: assembly?.bindings ?? {},
    // Live projection: `{ ...prototype }` snapshots the prototype's viewModel
    // getter as a plain value, freezing the view model at derive time. The
    // derived runtime re-exposes the prototype's live projection instead.
    get viewModel() {
      return prototype.viewModel;
    },
    call(name, input, config) {
      if (name === 'counter.increment') {
        return prototype.call(name, input, config);
      }
      return prototype.call(name, input, config);
    },
  };
}
