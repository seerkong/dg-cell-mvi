import {
  HALFCODE_RUNTIME_EXECUTION_FAILED,
  HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
  HALFCODE_RUNTIME_REF_UNRESOLVED,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  type HalfcodeRef,
  type HalfcodeUnitDiagnosticCode,
  type RuntimeInstanceRef,
} from 'dg-cell-mvi-halfcode-contract';

export interface HalfcodeRuntimeExecutionDiagnostic {
  severity: 'warning' | 'error';
  code: HalfcodeUnitDiagnosticCode;
  message: string;
}

export interface RuntimeCodeResolveContext {
  role: 'runtime-code-entry';
}

export type RuntimeCodeResolver = (
  ref: HalfcodeRef,
  context: RuntimeCodeResolveContext,
) => unknown | Promise<unknown>;

export interface ExecuteHalfcodeRuntimeCodeOptions<TInput = unknown, TConfig = unknown> {
  src: HalfcodeRef;
  runtime: unknown;
  input?: TInput;
  config?: TConfig;
  instanceRefs?: RuntimeInstanceRef[];
  resolveSymbol: RuntimeCodeResolver;
}

export interface ExecuteHalfcodeRuntimeCodeResult<TOutput = unknown> {
  output?: TOutput;
  diagnostics: HalfcodeRuntimeExecutionDiagnostic[];
}

export async function executeHalfcodeRuntimeCode<TOutput = unknown, TInput = unknown, TConfig = unknown>(
  options: ExecuteHalfcodeRuntimeCodeOptions<TInput, TConfig>,
): Promise<ExecuteHalfcodeRuntimeCodeResult<TOutput>> {
  const diagnostics: HalfcodeRuntimeExecutionDiagnostic[] = [];
  let symbol: unknown;
  try {
    symbol = await options.resolveSymbol(options.src, { role: 'runtime-code-entry' });
  } catch (error) {
    // Symbol resolution failure is a ref problem, not a scope-binding problem.
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_REF_UNRESOLVED,
      `Failed to resolve runtime code entry "${options.src}": ${toErrorMessage(error)}`,
    );
    return { diagnostics };
  }

  if (typeof symbol !== 'function') {
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_PROTOCOL_MISMATCH,
      `Runtime code entry "${options.src}" did not resolve to a function.`,
    );
    return { diagnostics };
  }

  try {
    const output = options.instanceRefs === undefined
      ? await symbol(options.runtime, options.input, options.config)
      : await symbol(options.runtime, options.instanceRefs, options.input, options.config);
    return { output: output as TOutput, diagnostics };
  } catch (error) {
    // The code entry itself threw while executing.
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_EXECUTION_FAILED,
      `Runtime code entry "${options.src}" failed: ${toErrorMessage(error)}`,
    );
    return { diagnostics };
  }
}

function pushDiagnostic(
  diagnostics: HalfcodeRuntimeExecutionDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
  message: string,
): void {
  diagnostics.push({
    severity: HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[code],
    code,
    message,
  });
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
