import { defineGraphModule, output, state } from 'depa-data-graph-core';

export const CounterGraphModule = defineGraphModule('counter.core', {
  state: {
    count: state<number>(),
  },
  outputs: {
    value: output<number>(),
    label: output<string>(),
  },
});

export type CounterGraphModuleType = typeof CounterGraphModule;

export type CounterValueLogic = (
  runtime: unknown,
  input: { count: number },
  config: Record<string, unknown>,
) => number;

export type CounterLabelLogic = (
  runtime: unknown,
  input: { count: number },
  config: Record<string, unknown>,
) => string;

export type CounterAction = (
  runtime: unknown,
  input: { step?: number },
  config: { step?: number },
) => void;
