import {
  formatDocumentInstanceRef,
  parseDocumentInstanceRef,
  validateXnlProjectionCommandResult,
  validateXnlProjectionInteraction,
  XNL_PROJECTION_OWNERSHIP_FIELD_NAMES,
  type DocumentInstanceRef,
  type XnlProjectionPresenterEditIntent,
  type XnlProjectionPresenterDeepReadonly,
  type XnlProjectionPresenterReadonlyView,
  type XnlProjectionSerializableRecord,
  type XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  isXnlProjectionPresenterRuntimeFacet,
  resolveApplicationDataCapability,
} from
  'dg-cell-mvi-halfcode-support/xnl-projection-presenter';
import type {
  XnlRichDocumentEmbeddedPresenterCapabilityConfig,
  XnlRichDocumentEmbeddedPresenterCapabilityInput,
  XnlRichDocumentEmbeddedPresenterCapabilityResult,
  XnlRichDocumentEmbeddedPresenterDiagnostic,
  XnlRichDocumentEmbeddedPresenterDiagnosticCode,
  XnlRichDocumentEmbeddedPresenterEditPort,
  XnlRichDocumentEmbeddedPresenterEditResult,
  XnlRichDocumentEmbeddedPresenterHostRuntime,
  XnlRichDocumentEmbeddedPresenterInput,
} from './types';

const EMPTY = Object.freeze({}) as Readonly<Record<PropertyKey, never>>;
const FORBIDDEN_SERIALIZABLE_FIELDS = new Set<string>(XNL_PROJECTION_OWNERSHIP_FIELD_NAMES);
const EMBEDDED_DIAGNOSTIC_CODES = new Set<XnlRichDocumentEmbeddedPresenterDiagnosticCode>([
  'INVALID_EMBEDDED_PRESENTER_RUNTIME',
  'INVALID_EMBEDDED_PRESENTER_FACET',
  'INVALID_EMBEDDED_PRESENTER_INPUT',
  'INVALID_EMBEDDED_PRESENTER_SNAPSHOT',
  'INVALID_EMBEDDED_PRESENTER_INSTANCE_REF',
  'INVALID_EMBEDDED_PRESENTER_EDIT_INTENT',
  'EMBEDDED_PRESENTER_EDIT_PORT_REJECTED',
]);

type ReadResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; message: string }>;

export function createXnlRichDocumentEmbeddedPresenterCapability<
  THost extends object,
  TView extends object,
  TSnapshot extends XnlProjectionSerializableRecord,
>(
  runtime: THost & XnlRichDocumentEmbeddedPresenterHostRuntime<TView, THost>,
  input: XnlRichDocumentEmbeddedPresenterCapabilityInput<TSnapshot>,
  config: XnlRichDocumentEmbeddedPresenterCapabilityConfig,
): XnlRichDocumentEmbeddedPresenterCapabilityResult<TView, TSnapshot> {
  const emptyConfig = readExactDataRecord(config, [], 'Embedded Presenter config');
  if (!emptyConfig.ok) return rejected('INVALID_EMBEDDED_PRESENTER_INPUT', emptyConfig.message);

  const hostFacet = readDataProperty(runtime, 'presenterFacet', 'Embedded Presenter runtime');
  const hostPort = readDataProperty(runtime, 'editIntentPort', 'Embedded Presenter runtime');
  if (!hostFacet.ok) {
    return rejected('INVALID_EMBEDDED_PRESENTER_RUNTIME', hostFacet.message);
  }
  if (!hostPort.ok) {
    return rejected('INVALID_EMBEDDED_PRESENTER_RUNTIME', hostPort.message);
  }
  if (!isXnlProjectionPresenterRuntimeFacet<TView>(hostFacet.value)) {
    return rejected(
      'INVALID_EMBEDDED_PRESENTER_FACET',
      'Embedded Presenter runtime must provide a support-owned Presenter runtime facet.',
    );
  }
  if (typeof hostPort.value !== 'function') {
    return rejected(
      'INVALID_EMBEDDED_PRESENTER_RUNTIME',
      'Embedded Presenter editIntentPort must be a data-function descriptor.',
    );
  }

  const lifecycle = readExactDataRecord(
    input,
    ['phase', 'instanceRef', 'snapshot'],
    'Embedded Presenter lifecycle input',
  );
  if (!lifecycle.ok) return rejected('INVALID_EMBEDDED_PRESENTER_INPUT', lifecycle.message);
  if (lifecycle.value.phase !== 'mount' && lifecycle.value.phase !== 'update') {
    return rejected(
      'INVALID_EMBEDDED_PRESENTER_INPUT',
      'Embedded Presenter lifecycle phase must be "mount" or "update".',
    );
  }

  const instanceRef = snapshotDocumentInstanceRef(lifecycle.value.instanceRef);
  if (!instanceRef.ok) {
    return rejected('INVALID_EMBEDDED_PRESENTER_INSTANCE_REF', instanceRef.message);
  }
  const snapshot = snapshotXnlRichDocumentEmbeddedSerializableRecord(
    lifecycle.value.snapshot,
    'Embedded Presenter occurrence snapshot',
  );
  if (!snapshot.ok) {
    return rejected('INVALID_EMBEDDED_PRESENTER_SNAPSHOT', snapshot.message);
  }

  const facetView = readFacetView<TView>(hostFacet.value);
  if (!facetView.ok) {
    return rejected('INVALID_EMBEDDED_PRESENTER_FACET', facetView.message);
  }
  const editIntentPort = hostPort.value as XnlRichDocumentEmbeddedPresenterEditPort<THost>;
  const emitEditIntent = Object.freeze((
    presenterRuntime: unknown,
    editInput: unknown,
    editConfig: unknown,
  ): Promise<XnlRichDocumentEmbeddedPresenterEditResult> => new Promise((resolve) => {
    if (presenterRuntime !== facetView.value) {
      resolve(rejectedEdit(
        'INVALID_EMBEDDED_PRESENTER_RUNTIME',
        'emitEditIntent requires the exact readonly view proven by this Presenter facet.',
      ));
      return;
    }
    const emptyEditConfig = readExactDataRecord(
      editConfig,
      [],
      'Embedded Presenter edit config',
    );
    const normalizedInput = snapshotEditPortInput(editInput);
    if (!emptyEditConfig.ok) {
      resolve(rejectedEdit('INVALID_EMBEDDED_PRESENTER_EDIT_INTENT', emptyEditConfig.message));
      return;
    }
    if (!normalizedInput.ok) {
      resolve(rejectedEdit('INVALID_EMBEDDED_PRESENTER_EDIT_INTENT', normalizedInput.message));
      return;
    }

    let output: unknown;
    try {
      output = Reflect.apply(editIntentPort, runtime, [
        runtime,
        Object.freeze({ intent: normalizedInput.value }),
        EMPTY,
      ]);
    } catch (error) {
      resolve(rejectedEdit(
        'EMBEDDED_PRESENTER_EDIT_PORT_REJECTED',
        `Embedded Presenter edit port threw: ${errorMessage(error)}`,
      ));
      return;
    }

    const settle = (value: unknown): void => resolve(snapshotEditResult(value));
    const fail = (error: unknown): void => resolve(rejectedEdit(
      'EMBEDDED_PRESENTER_EDIT_PORT_REJECTED',
      `Embedded Presenter edit port rejected: ${errorMessage(error)}`,
    ));
    if (output !== null && (typeof output === 'object' || typeof output === 'function')) {
      try {
        Promise.prototype.then.call(output, settle, fail);
        return;
      } catch {
        // A non-Promise value is inspected as data below; no then accessor is read.
      }
    }
    settle(output);
  }));

  const embeddedInput: XnlRichDocumentEmbeddedPresenterInput<TView, TSnapshot> = Object.freeze({
    view: facetView.value,
    snapshot: snapshot.value as XnlProjectionPresenterDeepReadonly<TSnapshot>,
    instanceRef: instanceRef.value,
    emitEditIntent,
  });
  return Object.freeze({
    status: 'ready' as const,
    phase: lifecycle.value.phase,
    embeddedInput,
    diagnostics: Object.freeze([]) as readonly [],
  });
}

function readFacetView<TView extends object>(
  facet: object,
): ReadResult<XnlProjectionPresenterReadonlyView<TView>> {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(facet, 'view');
    if (descriptor === undefined || !('value' in descriptor) || descriptor.value === null) {
      return { ok: false, message: 'Presenter facet view must be an own data property.' };
    }
    if (typeof descriptor.value !== 'object') {
      return { ok: false, message: 'Presenter facet view must be an object.' };
    }
    return {
      ok: true,
      value: descriptor.value as XnlProjectionPresenterReadonlyView<TView>,
    };
  } catch (error) {
    return { ok: false, message: `Presenter facet could not be inspected: ${errorMessage(error)}` };
  }
}

function snapshotDocumentInstanceRef(value: unknown): ReadResult<Readonly<DocumentInstanceRef>> {
  const fields = readExactDataRecord(
    value,
    ['unitInstanceId', 'projectionRole', 'xId'],
    'Embedded Presenter instanceRef',
  );
  if (!fields.ok) return fields;
  const clone = Object.freeze({
    unitInstanceId: fields.value.unitInstanceId,
    projectionRole: fields.value.projectionRole,
    xId: fields.value.xId,
  }) as unknown as DocumentInstanceRef;
  try {
    return { ok: true, value: Object.freeze(parseDocumentInstanceRef(formatDocumentInstanceRef(clone))) };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

function snapshotEditPortInput(value: unknown): ReadResult<XnlProjectionPresenterEditIntent> {
  const fields = readExactDataRecord(value, ['intent'], 'Embedded Presenter edit input');
  if (!fields.ok) return fields;
  return snapshotEditIntent(fields.value.intent);
}

function snapshotEditIntent(value: unknown): ReadResult<XnlProjectionPresenterEditIntent> {
  const wrapper = readExactDataRecord(value, ['kind', 'proposal'], 'Presenter edit intent');
  if (!wrapper.ok) return wrapper;
  const kind = wrapper.value.kind;
  if (kind !== 'interaction' && kind !== 'command') {
    return { ok: false, message: 'Presenter edit intent kind must be "interaction" or "command".' };
  }
  const proposal = snapshotXnlRichDocumentEmbeddedSerializableRecord(
    wrapper.value.proposal,
    'Presenter edit intent proposal',
  );
  if (!proposal.ok) return proposal;
  const validation = kind === 'interaction'
    ? validateXnlProjectionInteraction(proposal.value)
    : validateXnlProjectionCommandResult(Object.freeze({
        status: 'translated' as const,
        command: proposal.value,
      }));
  if (!validation.ok) {
    const issue = validation.issues[0];
    return {
      ok: false,
      message: issue === undefined
        ? 'Presenter edit intent proposal failed canonical validation.'
        : `Presenter edit intent proposal failed canonical validation at ${issue.path}: ${issue.message}`,
    };
  }
  return {
    ok: true,
    value: Object.freeze({ kind, proposal: proposal.value }) as XnlProjectionPresenterEditIntent,
  };
}

function snapshotEditResult(value: unknown): XnlRichDocumentEmbeddedPresenterEditResult {
  const statusRecord = readDataProperty(value, 'status', 'Embedded Presenter edit-port result');
  if (!statusRecord.ok) {
    return rejectedEdit('EMBEDDED_PRESENTER_EDIT_PORT_REJECTED', statusRecord.message);
  }
  if (statusRecord.value === 'emitted') {
    const exact = readExactDataRecord(value, ['status'], 'Embedded Presenter emitted result');
    return exact.ok
      ? Object.freeze({ status: 'emitted' })
      : rejectedEdit('EMBEDDED_PRESENTER_EDIT_PORT_REJECTED', exact.message);
  }
  if (statusRecord.value === 'rejected') {
    const exact = readExactDataRecord(
      value,
      ['status', 'diagnostics'],
      'Embedded Presenter rejected result',
    );
    if (!exact.ok) {
      return rejectedEdit('EMBEDDED_PRESENTER_EDIT_PORT_REJECTED', exact.message);
    }
    const diagnostics = snapshotDiagnostics(exact.value.diagnostics);
    if (!diagnostics.ok) {
      return rejectedEdit('EMBEDDED_PRESENTER_EDIT_PORT_REJECTED', diagnostics.message);
    }
    return Object.freeze({ status: 'rejected', diagnostics: diagnostics.value });
  }
  return rejectedEdit(
    'EMBEDDED_PRESENTER_EDIT_PORT_REJECTED',
    'Embedded Presenter edit-port result has an unsupported status.',
  );
}

function snapshotDiagnostics(
  value: unknown,
): ReadResult<readonly [XnlRichDocumentEmbeddedPresenterDiagnostic, ...XnlRichDocumentEmbeddedPresenterDiagnostic[]]> {
  const array = readDenseArray(value, 'Embedded Presenter diagnostics');
  if (!array.ok) return array;
  if (array.value.length === 0) {
    return { ok: false, message: 'Embedded Presenter rejected result requires diagnostics.' };
  }
  const diagnostics: XnlRichDocumentEmbeddedPresenterDiagnostic[] = [];
  for (const item of array.value) {
    const fields = readExactDataRecord(item, ['severity', 'code', 'message'], 'Embedded Presenter diagnostic');
    if (
      !fields.ok
      || fields.value.severity !== 'error'
      || typeof fields.value.code !== 'string'
      || !EMBEDDED_DIAGNOSTIC_CODES.has(
        fields.value.code as XnlRichDocumentEmbeddedPresenterDiagnosticCode,
      )
      || typeof fields.value.message !== 'string'
    ) {
      return { ok: false, message: fields.ok ? 'Embedded Presenter diagnostic is invalid.' : fields.message };
    }
    diagnostics.push(Object.freeze({
      severity: 'error',
      code: fields.value.code as XnlRichDocumentEmbeddedPresenterDiagnosticCode,
      message: fields.value.message,
    }));
  }
  return {
    ok: true,
    value: Object.freeze(diagnostics) as readonly [
      XnlRichDocumentEmbeddedPresenterDiagnostic,
      ...XnlRichDocumentEmbeddedPresenterDiagnostic[],
    ],
  };
}

export function snapshotXnlRichDocumentEmbeddedSerializableRecord(
  value: unknown,
  label: string,
): ReadResult<XnlProjectionSerializableRecord> {
  const snapshot = snapshotXnlRichDocumentEmbeddedSerializableValue(value, label, new Set());
  if (!snapshot.ok) return snapshot;
  if (snapshot.value === null || typeof snapshot.value !== 'object' || Array.isArray(snapshot.value)) {
    return { ok: false, message: `${label} must be a serializable record.` };
  }
  return { ok: true, value: snapshot.value as XnlProjectionSerializableRecord };
}

export function snapshotXnlRichDocumentEmbeddedSerializableValue(
  value: unknown,
  label: string,
  ancestors: Set<object>,
): ReadResult<XnlProjectionSerializableValue> {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { ok: true, value };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: `${label} contains a non-finite number.` };
  }
  if (typeof value !== 'object') {
    return { ok: false, message: `${label} contains a non-serializable value.` };
  }
  if (ancestors.has(value)) return { ok: false, message: `${label} contains a cycle.` };
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = readDenseArray(value, label);
      if (!items.ok) return items;
      const clone: XnlProjectionSerializableValue[] = [];
      for (let index = 0; index < items.value.length; index += 1) {
        const item = snapshotXnlRichDocumentEmbeddedSerializableValue(
          items.value[index],
          `${label}[${index}]`,
          ancestors,
        );
        if (!item.ok) return item;
        clone.push(item.value);
      }
      return { ok: true, value: Object.freeze(clone) };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false, message: `${label} must contain only plain records and arrays.` };
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      return { ok: false, message: `${label} contains a symbol key.` };
    }
    const clone = Object.create(null) as Record<string, XnlProjectionSerializableValue>;
    for (const key of keys as string[]) {
      if (FORBIDDEN_SERIALIZABLE_FIELDS.has(key)) {
        return { ok: false, message: `${label}.${key} is an authority-bearing field.` };
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor) || descriptor.value === undefined) {
        return { ok: false, message: `${label}.${key} must be a defined data property.` };
      }
      const child = snapshotXnlRichDocumentEmbeddedSerializableValue(
        descriptor.value,
        `${label}.${key}`,
        ancestors,
      );
      if (!child.ok) return child;
      clone[key] = child.value;
    }
    return { ok: true, value: Object.freeze(clone) as XnlProjectionSerializableRecord };
  } catch (error) {
    return { ok: false, message: `${label} could not be inspected: ${errorMessage(error)}` };
  } finally {
    ancestors.delete(value);
  }
}

function readDenseArray(value: unknown, label: string): ReadResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return { ok: false, message: `${label} must be a standard array.` };
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      return { ok: false, message: `${label}.length must be a safe own data property.` };
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    const allowed = new Set<PropertyKey>(['length']);
    for (let index = 0; index < length; index += 1) allowed.add(String(index));
    if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
      return { ok: false, message: `${label} must be a dense array without extra fields.` };
    }
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !('value' in descriptor)) {
        return { ok: false, message: `${label}[${index}] must be a data property.` };
      }
      items.push(descriptor.value);
    }
    return { ok: true, value: items };
  } catch (error) {
    return { ok: false, message: `${label} could not be inspected: ${errorMessage(error)}` };
  }
}

function readExactDataRecord<const TKeys extends readonly string[]>(
  value: unknown,
  expectedKeys: TKeys,
  label: string,
): ReadResult<Record<TKeys[number], unknown>> {
  try {
    if (value === null || typeof value !== 'object') {
      return { ok: false, message: `${label} must be an object.` };
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length
      || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return { ok: false, message: `${label} must contain only ${expectedKeys.join(', ')}.` };
    }
    const record = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        return { ok: false, message: `${label}.${key} must be an own data property.` };
      }
      record[key] = descriptor.value;
    }
    return { ok: true, value: record as Record<TKeys[number], unknown> };
  } catch (error) {
    return { ok: false, message: `${label} could not be inspected: ${errorMessage(error)}` };
  }
}

function readDataProperty(
  value: unknown,
  key: string,
  label: string,
): ReadResult<unknown> {
  const resolution = resolveApplicationDataCapability(value, key);
  return resolution.ok
    ? resolution
    : { ok: false, message: `${label}.${key} ${resolution.reason}.` };
}

function rejected<TView extends object, TSnapshot extends XnlProjectionSerializableRecord>(
  code: XnlRichDocumentEmbeddedPresenterDiagnosticCode,
  message: string,
): XnlRichDocumentEmbeddedPresenterCapabilityResult<TView, TSnapshot> {
  return Object.freeze({ status: 'rejected', diagnostics: diagnostics(code, message) });
}

function rejectedEdit(
  code: XnlRichDocumentEmbeddedPresenterDiagnosticCode,
  message: string,
): XnlRichDocumentEmbeddedPresenterEditResult {
  return Object.freeze({ status: 'rejected', diagnostics: diagnostics(code, message) });
}

function diagnostics(
  code: XnlRichDocumentEmbeddedPresenterDiagnosticCode,
  message: string,
): readonly [XnlRichDocumentEmbeddedPresenterDiagnostic] {
  return Object.freeze([Object.freeze({ severity: 'error' as const, code, message })]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
