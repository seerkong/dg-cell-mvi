import {
  validateXnlAuthoringScopeAuthoringFacet,
  type XnlAuthoringValidationIssue,
  type XnlAuthoringEditScopeAuthoringFacet,
  type XnlAuthoringProposalPort,
  type XnlAuthoringSerializableValue,
  type XnlAuthoringViewScopeAuthoringFacet,
} from 'dg-cell-mvi-halfcode-contract';

export function createXnlAuthoringEditScopeFacet<
  TDocument = XnlAuthoringSerializableValue,
  TCommand = XnlAuthoringSerializableValue,
>(
  proposal: XnlAuthoringProposalPort<TDocument, TCommand>,
): XnlAuthoringEditScopeAuthoringFacet<TDocument, TCommand> {
  const isolatedProposal = Object.freeze({
    state: captureCapability(proposal, 'state'),
    subscribe: captureCapability(proposal, 'subscribe'),
    submit: captureCapability(proposal, 'submit'),
  });
  const facet = Object.freeze({
    mode: 'edit',
    proposal: isolatedProposal,
  });
  const validation = validateXnlAuthoringScopeAuthoringFacet(facet);
  if (!validation.ok) {
    throw new Error(`Invalid XNL authoring edit Scope facet: ${issuesToMessage(validation.issues)}`);
  }
  return facet;
}

export function createXnlAuthoringViewScopeFacet(): XnlAuthoringViewScopeAuthoringFacet {
  return Object.freeze({ mode: 'view' });
}

function issuesToMessage(issues: readonly XnlAuthoringValidationIssue[]): string {
  return issues
    .map((issue) => `${issue.path}${issue.code ? ` [${issue.code}]` : ''}: ${issue.message}`)
    .join('; ');
}

function captureCapability<
  TPort extends object,
  TKey extends keyof TPort,
>(port: TPort, key: TKey): TPort[TKey] {
  let current: object | null = port;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor !== undefined) {
      if (!('value' in descriptor) || typeof descriptor.value !== 'function') {
        throw new Error(`Invalid XNL authoring proposal capability: ${String(key)}`);
      }
      return descriptor.value.bind(port) as TPort[TKey];
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  throw new Error(`Invalid XNL authoring proposal capability: ${String(key)}`);
}
