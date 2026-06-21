export function readCounterValue(runtime, input, config) {
  return Number(input?.count ?? 0);
}

export function formatCounterLabel(runtime, input, config) {
  return `count = ${Number(input?.count ?? 0)}`;
}

export const counterGraphImpls = {
  'counter.value': readCounterValue,
  'counter.label': formatCounterLabel,
};
