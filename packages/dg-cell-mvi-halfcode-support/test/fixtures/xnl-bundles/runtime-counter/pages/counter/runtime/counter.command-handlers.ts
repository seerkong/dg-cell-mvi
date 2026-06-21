export function incrementCounter(runtime, input, config) {
  return runtime.call('counter.increment', input, config);
}
