export interface ComplexCtrlInput {
  values?: readonly unknown[];
}

export interface ComplexCtrlOutput {
  result: readonly unknown[];
}

export type InitArrayLogic = (
  runtime: unknown,
  input: ComplexCtrlInput,
  config: Readonly<Record<string, unknown>>,
) => readonly unknown[];
