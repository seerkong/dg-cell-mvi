import type { SchemaEditorSession, SchemaEditorValueHost } from './session';

export interface SchemaEditorScopeCapabilities<
  TValueHost = SchemaEditorValueHost,
  TSession = SchemaEditorSession,
> {
  readonly valueHosts?: Readonly<Record<string, TValueHost>>;
  readonly sessions?: Readonly<Record<string, TSession>>;
}

export interface SchemaEditorScopeBridgeRuntime<
  TValueHost = SchemaEditorValueHost,
  TSession = SchemaEditorSession,
> {
  readonly schemaEditor?: SchemaEditorScopeCapabilities<TValueHost, TSession>;
}

export type ResolveSchemaEditorScopeBridgeInput = Readonly<Record<string, unknown>>;

export interface ResolveSchemaEditorScopeBridgeConfig {
  readonly valueHostId: string;
  readonly sessionId: string;
}

export interface ResolvedSchemaEditorScopeBridge<
  TValueHost = SchemaEditorValueHost,
  TSession = SchemaEditorSession,
> {
  readonly valueHostId: string;
  readonly sessionId: string;
  readonly valueHost: TValueHost;
  readonly session: TSession;
}

export type SchemaEditorScopeBridgeDiagnosticCode =
  | 'INVALID_SCHEMA_EDITOR_SCOPE_BRIDGE_CONFIG'
  | 'SCHEMA_EDITOR_VALUE_HOST_UNRESOLVED'
  | 'SCHEMA_EDITOR_SESSION_UNRESOLVED';

export interface SchemaEditorScopeBridgeDiagnostic {
  readonly path: string;
  readonly code: SchemaEditorScopeBridgeDiagnosticCode;
  readonly message: string;
}

export type ResolveSchemaEditorScopeBridgeResult<
  TValueHost = SchemaEditorValueHost,
  TSession = SchemaEditorSession,
> = ResolvedSchemaEditorScopeBridge<TValueHost, TSession> | undefined;

type ScopeBridgeProjection<TValueHost, TSession> =
  | {
      readonly ok: true;
      readonly bridge: ResolvedSchemaEditorScopeBridge<TValueHost, TSession>;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly SchemaEditorScopeBridgeDiagnostic[];
    };

export function resolveSchemaEditorScopeBridge<
  TValueHost = SchemaEditorValueHost,
  TSession = SchemaEditorSession,
>(
  runtime: SchemaEditorScopeBridgeRuntime<TValueHost, TSession>,
  _input: ResolveSchemaEditorScopeBridgeInput,
  config: ResolveSchemaEditorScopeBridgeConfig,
): ResolveSchemaEditorScopeBridgeResult<TValueHost, TSession> {
  const result = projectScopeBridge(runtime, config);
  return result.ok ? result.bridge : undefined;
}

function projectScopeBridge<TValueHost, TSession>(
  runtime: SchemaEditorScopeBridgeRuntime<TValueHost, TSession>,
  config: ResolveSchemaEditorScopeBridgeConfig,
): ScopeBridgeProjection<TValueHost, TSession> {
  const valueHostId = readOwnString(config, 'valueHostId');
  const sessionId = readOwnString(config, 'sessionId');
  if (valueHostId === undefined || sessionId === undefined) {
    return rejected(
      '$.config',
      'INVALID_SCHEMA_EDITOR_SCOPE_BRIDGE_CONFIG',
      'Scope bridge config requires own non-empty valueHostId and sessionId strings.',
    );
  }

  const capabilities = readOwnDataProperty(runtime, 'schemaEditor');
  const valueHosts = readOwnDataProperty(capabilities, 'valueHosts');
  const sessions = readOwnDataProperty(capabilities, 'sessions');
  const valueHost = readOwnDataProperty<TValueHost>(valueHosts, valueHostId);
  if (valueHost === undefined) {
    return rejected(
      '$.runtime.schemaEditor.valueHosts',
      'SCHEMA_EDITOR_VALUE_HOST_UNRESOLVED',
      `No schema-editor ValueHost is visible for id "${valueHostId}".`,
    );
  }
  const session = readOwnDataProperty<TSession>(sessions, sessionId);
  if (session === undefined) {
    return rejected(
      '$.runtime.schemaEditor.sessions',
      'SCHEMA_EDITOR_SESSION_UNRESOLVED',
      `No schema-editor session is visible for id "${sessionId}".`,
    );
  }

  return {
    ok: true,
    bridge: Object.freeze({ valueHostId, sessionId, valueHost, session }),
    diagnostics: [],
  };
}

function readOwnString(value: unknown, key: string): string | undefined {
  const candidate = readOwnDataProperty(value, key);
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function readOwnDataProperty<T = unknown>(value: unknown, key: string): T | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value as T : undefined;
  } catch {
    return undefined;
  }
}

function rejected(
  path: string,
  code: SchemaEditorScopeBridgeDiagnosticCode,
  message: string,
): ScopeBridgeProjection<never, never> {
  return {
    ok: false,
    diagnostics: [Object.freeze({ path, code, message })],
  };
}
