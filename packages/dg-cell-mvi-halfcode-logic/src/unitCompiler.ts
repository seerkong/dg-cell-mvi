/**
 * v3 hierarchical unit bundle compiler (track add-halfcode-v3-compiler-projection, P2).
 *
 * compileHalfcodeUnitBundle projects a loaded v3 unit bundle (contract-level
 * UnitCompileInput — the loader's LoadedHalfcodeUnitBundle is structurally
 * assignable) into three plans plus diagnostics:
 *
 *   1. AdminShellPlanV3   — route tree expansion (nesting preserved); title =
 *                           Route override ?? page manifest default (D6);
 *                           menu/permission binding pass-through; page resolved
 *                           to a page FQN.
 *   2. UnitRenderPlan[]   — per-unit element tree projection covering every
 *                           node category (atom / capsule / component instance
 *                           / page embed / named slots); the renderer never
 *                           interprets raw XNL.
 *   3. WiringPlan         — <Wire> endpoints resolved against the route
 *                           instance table (route://#id and route://<path>),
 *                           message identity checked against PageContract
 *                           sends/accepts (D5/D13).
 *
 * Compile-time contract checks (spec §7):
 *   - Route path `:var` set vs target PageContract.urlInputs.path, and
 *     embedded page urlInputs satisfiability → HALFCODE_ROUTE_URLINPUTS_MISMATCH
 *   - component instance inlineProps vs ComponentContract.props
 *     → HALFCODE_PROPS_CONTRACT_MISMATCH
 *   - Capsule Requires along the host scope chain (command/effect/config
 *     reachability) → HALFCODE_CAPSULE_REQUIRES_UNMET
 *   - page message with no wire → HALFCODE_MESSAGE_UNWIRED (warning)
 *
 * Recorded decisions/tradeoffs (see track findings):
 *   - urlInputs / props binding present ⇒ inputs treated as provided in batch;
 *     value-level verification is beyond compile scope (runtime/G5).
 *   - Wire message not declared by an endpoint page contract reuses
 *     HALFCODE_REF_UNRESOLVED (a message reference that fails to resolve in the
 *     endpoint's public contract) — no tenth code is introduced.
 *   - HALFCODE_MESSAGE_UNWIRED is computed per PAGE (any wire from any of the
 *     page's routes counts), and only for pages mounted on at least one route
 *     — embedded-only pages deliver messages by tree bubbling, not app wiring.
 *   - Dotted tags absent from the unit registry project as UI-library atoms
 *     (`library` = namespace root); existence checking is the loader's job.
 *
 * v2 isolation: this module is a NEW entry point. compileHalfcode / v2 plans
 * are untouched, and nothing here imports dg-cell-mvi-halfcode-support.
 */

import {
  HALFCODE_CAPSULE_REQUIRES_UNMET,
  HALFCODE_MESSAGE_UNWIRED,
  HALFCODE_PROPS_CONTRACT_MISMATCH,
  HALFCODE_REF_UNRESOLVED,
  HALFCODE_ROUTE_URLINPUTS_MISMATCH,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  HALFCODE_UNIT_KIND_MISMATCH,
  HALFCODE_UNIT_NOT_FOUND,
  parseHalfcodeRef,
  type AdminShellPlanV3,
  type AdminShellRoutePlanV3,
  type ComponentContractSpec,
  type DataGraphBindingsSpec,
  type DataGraphModulePlan,
  type DataGraphNodePlan,
  type DataGraphScopePlan,
  type HalfcodeRef,
  type HalfcodeUnitDiagnosticCode,
  type PageContractSpec,
  type ParsedHalfcodeRef,
  type RenderNodePlan,
  type RenderSlotPlan,
  type RouteSpec,
  type MessageDispatchPlanEntry,
  type RuntimeScopeBindingSpec,
  type ScopeRuntimePlan,
  type ScopeUseSpec,
  type SerializableValue,
  type SerializableRecord,
  type UnitCompileDiagnostic,
  type UnitCompileDomainDocument,
  type UnitCompileInput,
  type UnitCompileResult,
  type UnitCompileUnit,
  type UnitDomainNodeSpec,
  type UnitElementContractSpec,
  type UnitElementNode,
  type UnitFqn,
  type UnitRenderPlan,
  type WirePlanBinding,
} from 'dg-cell-mvi-halfcode-contract';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pushDiagnostic(
  diagnostics: UnitCompileDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
  message: string,
  path?: string,
): void {
  if (diagnostics.some((existing) => existing.code === code && existing.message === message)) return;
  diagnostics.push({ severity: HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[code], code, message, path });
}

function safeParseRef(ref: string): ParsedHalfcodeRef | null {
  try {
    return parseHalfcodeRef(ref);
  } catch {
    return null;
  }
}

/** Anchor of a logical ref: the `#id` (preferred) or the hierarchical path. */
function refAnchor(ref: string): string | undefined {
  const parsed = safeParseRef(ref);
  return parsed?.id ?? parsed?.path;
}

/** Type descriptor strings ending in `?` are optional (`"string?"`). */
function isOptionalType(type: string): boolean {
  return type.trim().endsWith('?');
}

/** `:var` variables of a route path pattern. */
function pathVariables(pattern: string): string[] {
  return [...pattern.matchAll(/:([A-Za-z_$][A-Za-z0-9_$-]*)/g)].map((match) => match[1]);
}

function pageContractOf(unit: UnitCompileUnit | undefined): PageContractSpec | undefined {
  return unit?.contract?.kind === 'page-contract' ? unit.contract : undefined;
}

function componentContractOf(unit: UnitCompileUnit | undefined): ComponentContractSpec | undefined {
  return unit?.contract?.kind === 'component-contract' ? unit.contract : undefined;
}

/** Flatten a domain document's node tree into an id → node index (first wins). */
function domainNodeIndex(doc: UnitCompileDomainDocument | undefined): Map<string, UnitDomainNodeSpec> {
  const index = new Map<string, UnitDomainNodeSpec>();
  const visit = (node: UnitDomainNodeSpec): void => {
    if (node.id && !index.has(node.id)) index.set(node.id, node);
    for (const child of node.children ?? []) visit(child);
  };
  for (const node of doc?.nodes ?? []) visit(node);
  return index;
}

/** Drill a '.'-separated field path (or '/'-separated sub-path segments) into plain data. */
function drillData(data: unknown, segments: string[]): boolean {
  let current = data;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
    if (!(segment in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

/** Depth-first element walk over children and named slots. */
function walkElements(nodes: UnitElementNode[] | undefined, visit: (node: UnitElementNode) => void): void {
  for (const node of nodes ?? []) {
    visit(node);
    walkElements(node.children, visit);
    for (const slot of node.slots ?? []) walkElements(slot.children, visit);
  }
}

// ---------------------------------------------------------------------------
// Route projection + urlInputs matching (T2.1)
// ---------------------------------------------------------------------------

interface RouteIndexEntry {
  routeId: string;
  routePath: string;
  pageFqn: UnitFqn;
}

interface RouteIndex {
  byId: Map<string, RouteIndexEntry>;
  byPath: Map<string, RouteIndexEntry>;
  entries: RouteIndexEntry[];
}

function resolvePageFqn(page: string): UnitFqn {
  return (refAnchor(page) ?? '') as UnitFqn;
}

function buildRouteIndex(routes: RouteSpec[]): RouteIndex {
  const index: RouteIndex = { byId: new Map(), byPath: new Map(), entries: [] };
  const visit = (route: RouteSpec): void => {
    const entry: RouteIndexEntry = {
      routeId: route.id,
      routePath: route.path,
      pageFqn: resolvePageFqn(route.page),
    };
    if (!index.byId.has(route.id)) index.byId.set(route.id, entry);
    if (!index.byPath.has(route.path)) index.byPath.set(route.path, entry);
    index.entries.push(entry);
    for (const child of route.children ?? []) visit(child);
  };
  for (const route of routes) visit(route);
  return index;
}

function checkRouteUrlInputs(
  route: RouteSpec,
  contract: PageContractSpec | undefined,
  pageFqn: UnitFqn,
  diagnostics: UnitCompileDiagnostic[],
): void {
  const declared = contract?.urlInputs?.path ?? {};
  const vars = new Set(pathVariables(route.path));
  const undeclared = [...vars].filter((name) => !(name in declared));
  const unfilled = Object.entries(declared)
    .filter(([name, type]) => !isOptionalType(type) && !vars.has(name))
    .map(([name]) => name);
  if (!undeclared.length && !unfilled.length) return;

  const details: string[] = [];
  if (undeclared.length) {
    details.push(
      `path variable(s) ${undeclared.map((name) => `:${name}`).join(', ')} are not declared by urlInputs.path of page "${pageFqn}"`,
    );
  }
  if (unfilled.length) {
    details.push(
      `required urlInputs.path variable(s) ${unfilled.join(', ')} of page "${pageFqn}" are not provided by path "${route.path}"`,
    );
  }
  pushDiagnostic(
    diagnostics,
    HALFCODE_ROUTE_URLINPUTS_MISMATCH,
    `Route "#${route.id}" (${route.path}) does not match urlInputs of "${pageFqn}": ${details.join('; ')}`,
    `route://#${route.id}`,
  );
}

function projectRoute(
  route: RouteSpec,
  input: UnitCompileInput,
  diagnostics: UnitCompileDiagnostic[],
): AdminShellRoutePlanV3 {
  const pageFqn = resolvePageFqn(route.page);
  const unit = input.units[pageFqn];
  if (!unit) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_UNIT_NOT_FOUND,
      `Route "#${route.id}" page "${route.page}" does not resolve to a loaded unit`,
      `route://#${route.id}`,
    );
  } else if (unit.kind !== 'page') {
    pushDiagnostic(
      diagnostics,
      HALFCODE_UNIT_KIND_MISMATCH,
      `Route "#${route.id}" page "${route.page}" resolves to a ${unit.kind}, expected a page`,
      `route://#${route.id}`,
    );
  }
  checkRouteUrlInputs(route, pageContractOf(unit), pageFqn, diagnostics);

  const manifestTitle = unit?.manifest.kind === 'page' ? unit.manifest.title : undefined;
  const children = (route.children ?? []).map((child) => projectRoute(child, input, diagnostics));
  return {
    id: route.id,
    path: route.path,
    title: route.title ?? manifestTitle,
    menu: route.menu,
    permissionBinding: route.permission,
    pageFqn,
    ...(children.length ? { children } : {}),
  };
}

// ---------------------------------------------------------------------------
// Element-level contract checks: embedded page urlInputs + component props (T2.1)
// ---------------------------------------------------------------------------

function checkEmbeddedPageInstance(
  node: UnitElementNode & { kind: 'instance' },
  target: UnitCompileUnit,
  host: UnitCompileUnit,
  diagnostics: UnitCompileDiagnostic[],
): void {
  // urlInputs present ⇒ synthetic URL inputs provided in batch (D2); the
  // ref's resolvability is loader-checked, value-level matching is runtime.
  if (node.urlInputs) return;
  const required = Object.entries(pageContractOf(target)?.urlInputs?.path ?? {})
    .filter(([, type]) => !isOptionalType(type))
    .map(([name]) => name);
  if (!required.length) return;
  pushDiagnostic(
    diagnostics,
    HALFCODE_ROUTE_URLINPUTS_MISMATCH,
    `Embedded page instance "#${node.id}" in unit "${host.fqn}" provides no urlInputs binding, but page "${target.fqn}" requires urlInputs.path variable(s) ${required.join(', ')}`,
    host.path,
  );
}

function checkComponentInstanceProps(
  node: UnitElementNode & { kind: 'instance' },
  target: UnitCompileUnit,
  host: UnitCompileUnit,
  diagnostics: UnitCompileDiagnostic[],
): void {
  const contract = componentContractOf(target);
  if (!contract) return; // no public props contract to check against
  const declared = contract.props ?? {};
  const inline = Object.keys(node.inlineProps ?? {});

  const unknown = inline.filter((name) => !(name in declared));
  if (unknown.length) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_PROPS_CONTRACT_MISMATCH,
      `Instance "#${node.id}" in unit "${host.fqn}" sets prop(s) ${unknown.join(', ')} not declared by ComponentContract of "${target.fqn}"`,
      host.path,
    );
  }

  // props present ⇒ props are provided in batch through config; required-prop
  // presence cannot be decided at compile time, so the check is skipped.
  if (!node.props) {
    const missing = Object.entries(declared)
      .filter(([name, type]) => !isOptionalType(type) && !inline.includes(name))
      .map(([name]) => name);
    if (missing.length) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_PROPS_CONTRACT_MISMATCH,
        `Instance "#${node.id}" in unit "${host.fqn}" is missing required prop(s) ${missing.join(', ')} of ComponentContract "${target.fqn}" and has no props binding`,
        host.path,
      );
    }
  }
}

function checkUnitInstances(
  unit: UnitCompileUnit,
  input: UnitCompileInput,
  diagnostics: UnitCompileDiagnostic[],
): void {
  walkElements(unit.elements?.children, (node) => {
    if (node.kind !== 'instance') return;
    const target = input.units[node.tag];
    if (!target) return; // HTML atom, UI-library atom, or loader-reported missing unit
    if (target.kind === 'page') checkEmbeddedPageInstance(node, target, unit, diagnostics);
    if (target.kind === 'component') checkComponentInstanceProps(node, target, unit, diagnostics);
  });
}

// ---------------------------------------------------------------------------
// Capsule Requires verification along the scope chain (T2.2, D14)
// ---------------------------------------------------------------------------

function scopeUseId(scope: ScopeUseSpec | undefined): string | undefined {
  if (!scope) return undefined;
  return scope.kind === 'ref' ? refAnchor(scope.ref) : scope.scope.scopeId;
}

function ownedScopeOccurrenceId(node: UnitElementNode): string | undefined {
  if (node.kind !== 'capsule' || !node.scope) return undefined;
  // Runtime scope maps are unit-local. The Capsule id identifies the lexical
  // occurrence, while scopeUseId remains the definition lookup key.
  return node.id;
}

function scopeNodeFromUse(
  scope: ScopeUseSpec | undefined,
  scopes: Map<string, UnitDomainNodeSpec>,
): UnitDomainNodeSpec | undefined {
  if (!scope) return undefined;
  if (scope.kind === 'ref') {
    const id = refAnchor(scope.ref);
    return id ? scopes.get(id) : undefined;
  }
  const binding = scope.scope;
  return {
    tag: 'Scope',
    id: binding.scopeId,
    data: {
      runtime: binding.runtime,
      config: binding.config,
      commands: binding.commands,
      events: binding.events,
    },
  };
}

function elementContractIndex(unit: UnitCompileUnit): Map<string, UnitElementContractSpec> {
  const index = new Map<string, UnitElementContractSpec>();
  for (const contract of unit.contract?.elementContracts ?? []) {
    index.set(contract.id, contract);
  }
  return index;
}

function checkUnitRequires(unit: UnitCompileUnit, diagnostics: UnitCompileDiagnostic[]): void {
  const contracts = elementContractIndex(unit);
  if (!contracts.size) return;

  const scopes = domainNodeIndex(unit.domains.scopes);
  const commands = domainNodeIndex(unit.domains.commands);
  const configs = domainNodeIndex(unit.domains.config);

  const checkRequires = (node: UnitElementNode, chain: UnitDomainNodeSpec[]): void => {
    if (node.kind !== 'capsule') return;
    const requires = contracts.get(node.id)?.requires;
    if (!requires) return;
    const missing: string[] = [];

    const checkDomainRequirement = (
      requiredRef: string,
      kind: 'commands' | 'config',
      scopeKey: 'commands' | 'config',
      nodes: Map<string, UnitDomainNodeSpec>,
    ): void => {
      const parsed = safeParseRef(requiredRef);
      const anchor = parsed?.id ?? parsed?.path;
      const reachable = chain.some((scope) => typeof scope.data[scopeKey] === 'string');
      const target = anchor ? nodes.get(anchor) : undefined;
      const resolved =
        !!target && (!parsed?.subPath || drillData(target.data, parsed.subPath.split('/')));
      if (!reachable) {
        missing.push(`${kind} ref "${requiredRef}" — no scope along the chain declares ${scopeKey}`);
      } else if (!resolved) {
        missing.push(`${kind} ref "${requiredRef}" does not resolve in the unit's ${kind} domain`);
      }
    };
    for (const ref of requires.commands) {
      checkDomainRequirement(ref, 'commands', 'commands', commands);
    }
    for (const ref of requires.config) {
      checkDomainRequirement(ref, 'config', 'config', configs);
    }

    if (missing.length) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_CAPSULE_REQUIRES_UNMET,
        `Capsule "#${node.id}" in unit "${unit.fqn}" has unmet Requires: ${missing.join('; ')}`,
        unit.path,
      );
    }
  };

  const visit = (nodes: UnitElementNode[] | undefined, chain: UnitDomainNodeSpec[]): void => {
    for (const node of nodes ?? []) {
      const ownScope = node.kind === 'capsule' ? scopeNodeFromUse(node.scope, scopes) : undefined;
      const currentChain = ownScope ? [ownScope, ...chain] : chain;
      checkRequires(node, currentChain);
      visit(node.children, currentChain);
      for (const slot of node.slots ?? []) visit(slot.children, currentChain);
    }
  };

  const rootScope = scopeNodeFromUse(unit.elements?.scope, scopes);
  visit(unit.elements?.children, rootScope ? [rootScope] : []);
}

// ---------------------------------------------------------------------------
// Wiring compilation + unwired messages (T2.2, D5/D13)
// ---------------------------------------------------------------------------

function messageRefsOf(refs: { ref: string }[] | undefined): Set<string> {
  return new Set((refs ?? []).map((entry) => entry.ref));
}

function resolveWireEndpoint(ref: string, index: RouteIndex): RouteIndexEntry | undefined {
  const parsed = safeParseRef(ref);
  if (!parsed || parsed.scheme !== 'route') return undefined;
  if (parsed.id !== undefined) return index.byId.get(parsed.id);
  const path = parsed.path ?? '';
  return index.byPath.get(path) ?? index.byPath.get(`/${path}`);
}

function compileWiring(
  input: UnitCompileInput,
  routeIndex: RouteIndex,
  diagnostics: UnitCompileDiagnostic[],
): WirePlanBinding[] {
  const bindings: WirePlanBinding[] = [];

  for (const wire of input.app.wiring) {
    const from = resolveWireEndpoint(wire.from, routeIndex);
    const to = resolveWireEndpoint(wire.to, routeIndex);
    let valid = true;
    if (!from) {
      pushDiagnostic(diagnostics, HALFCODE_REF_UNRESOLVED,
        `Wire from "${wire.from}" does not resolve to a route instance`);
      valid = false;
    }
    if (!to) {
      pushDiagnostic(diagnostics, HALFCODE_REF_UNRESOLVED,
        `Wire to "${wire.to}" does not resolve to a route instance`);
      valid = false;
    }
    const message = wire.message;
    if (from) {
      const sends = messageRefsOf(pageContractOf(input.units[from.pageFqn])?.sends);
      if (!sends.has(message)) {
        pushDiagnostic(diagnostics, HALFCODE_REF_UNRESOLVED,
          `Wire message "${message}" is not declared by PageContract.sends of "${from.pageFqn}" (route "#${from.routeId}")`);
        valid = false;
      }
    }
    if (to) {
      const accepts = messageRefsOf(pageContractOf(input.units[to.pageFqn])?.accepts);
      if (!accepts.has(message)) {
        pushDiagnostic(diagnostics, HALFCODE_REF_UNRESOLVED,
          `Wire message "${message}" is not declared by PageContract.accepts of "${to.pageFqn}" (route "#${to.routeId}")`);
        valid = false;
      }
    }
    if (valid && from && to) {
      bindings.push({
        fromRouteId: from.routeId,
        toRouteId: to.routeId,
        fromPageFqn: from.pageFqn,
        toPageFqn: to.pageFqn,
        message,
      });
    }
  }
  return bindings;
}

function checkUnwiredMessages(
  input: UnitCompileInput,
  routeIndex: RouteIndex,
  bindings: WirePlanBinding[],
  diagnostics: UnitCompileDiagnostic[],
): void {
  const mountedPages = new Set(routeIndex.entries.map((entry) => entry.pageFqn));
  for (const pageFqn of mountedPages) {
    const unit = input.units[pageFqn];
    const contract = pageContractOf(unit);
    const sends = messageRefsOf(contract?.sends);
    for (const message of sends) {
      const wired = bindings.some((binding) => binding.fromPageFqn === pageFqn && binding.message === message);
      if (!wired) {
        pushDiagnostic(
          diagnostics,
          HALFCODE_MESSAGE_UNWIRED,
          `Page "${pageFqn}" sends message "${message}" but no <Wire> in the app wiring references it`,
          unit?.path,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Unit render plan projection (T2.3)
// ---------------------------------------------------------------------------

function projectSlots(
  node: UnitElementNode,
  input: UnitCompileInput,
  scopeId: string | undefined,
): RenderSlotPlan[] | undefined {
  if (!node.slots?.length) return undefined;
  return node.slots.map((slot) => ({
    id: slot.id,
    children: (slot.children ?? []).map((child) => projectElementNode(child, input, scopeId)),
  }));
}

function projectElementNode(
  node: UnitElementNode,
  input: UnitCompileInput,
  inheritedScopeId: string | undefined,
): RenderNodePlan {
  const scopeId = ownedScopeOccurrenceId(node) ?? inheritedScopeId;
  const children = node.children?.length
    ? node.children.map((child) => projectElementNode(child, input, scopeId))
    : undefined;
  const slots = projectSlots(node, input, scopeId);
  const common = {
    id: node.id,
    ...(scopeId ? { scopeId } : {}),
    ...(children ? { children } : {}),
    ...(slots ? { slots } : {}),
  };

  if (node.kind === 'capsule') {
    return { kind: 'capsule', ...common };
  }

  const registryEntry = input.registry[node.tag];
  if (registryEntry?.kind === 'page') {
    return {
      kind: 'page-embed',
      ...common,
      tag: node.tag,
      pageFqn: registryEntry.fqn,
      urlInputsBinding: node.urlInputs,
      commandBinding: node.command,
    };
  }
  if (registryEntry?.kind === 'component') {
    return {
      kind: 'component',
      ...common,
      tag: node.tag,
      fqn: registryEntry.fqn,
      inlineProps: node.inlineProps,
      propsBinding: node.props,
      commandBinding: node.command,
    };
  }
  // HTML atom (lowercase bare tag) or UI-library element (dotted tag resolved
  // by the render adapter's UI registry; loader reports truly unknown tags).
  const library = node.tag.includes('.') ? node.tag.split('.')[0] : undefined;
  return {
    kind: 'atom',
    ...common,
    tag: node.tag,
    ...(library ? { library } : {}),
    inlineProps: node.inlineProps,
    propsBinding: node.props,
    commandBinding: node.command,
  };
}

function projectUnitRenderPlan(unit: UnitCompileUnit, input: UnitCompileInput): UnitRenderPlan {
  const scopeId = scopeUseId(unit.elements?.scope);
  return {
    id: `${unit.fqn}.unit-render-plan`,
    unitFqn: unit.fqn,
    unitKind: unit.kind,
    ...(scopeId ? { scopeId } : {}),
    title: unit.manifest.kind === 'page' ? unit.manifest.title : undefined,
    root: (unit.elements?.children ?? []).map((node) => projectElementNode(node, input, scopeId)),
  };
}

// ---------------------------------------------------------------------------
// Scope runtime + message dispatch plan projection
// ---------------------------------------------------------------------------

function scopeBindingFromUse(
  unit: UnitCompileUnit,
  scope: ScopeUseSpec,
): RuntimeScopeBindingSpec | undefined {
  if (scope.kind === 'inline') return scope.scope;
  const scopeId = scopeUseId(scope);
  if (!scopeId) return undefined;

  const parsed = unit.scopeRuntimeBindings?.find((binding) => binding.scopeId === scopeId);
  if (parsed) return parsed;

  const node = domainNodeIndex(unit.domains.scopes).get(scopeId);
  if (!node) return undefined;
  const refValue = (name: string): string | undefined =>
    typeof node.data[name] === 'string' ? node.data[name] as string : undefined;
  return {
    scopeId,
    runtime: refValue('runtime') as RuntimeScopeBindingSpec['runtime'],
    config: refValue('config') as RuntimeScopeBindingSpec['config'],
    commands: refValue('commands') as RuntimeScopeBindingSpec['commands'],
    events: refValue('events') as RuntimeScopeBindingSpec['events'],
  };
}

function scopePlanFromUse(
  unit: UnitCompileUnit,
  scope: ScopeUseSpec,
  scopeId: string,
  ownerElementId: string,
  parentScopeId: string | undefined,
): ScopeRuntimePlan | undefined {
  const binding = scopeBindingFromUse(unit, scope);
  if (!binding) return undefined;
  return {
    scopeId,
    ...(parentScopeId ? { parentScopeId } : {}),
    ownerElementId,
    unitFqn: unit.fqn,
    ...(binding.runtime ? { runtime: binding.runtime } : {}),
    ...(binding.config ? { config: binding.config } : {}),
    ...(binding.commands ? { commands: binding.commands } : {}),
    ...(binding.events ? { events: binding.events } : {}),
    ...(binding.messagePolicy ? { messagePolicy: binding.messagePolicy } : {}),
    ...(binding.effects ? { effects: binding.effects } : {}),
    ...(binding.dataGraphs ? {
      dataGraphs: compileDataGraphScopePlan(unit, scopeId, binding.dataGraphs),
    } : {}),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function compileGraphModule(unit: UnitCompileUnit, moduleId: string): DataGraphModulePlan {
  const moduleNode = domainNodeIndex(unit.domains['data.graph']).get(moduleId);
  const nodes: DataGraphNodePlan[] = [];
  const family = moduleId.split('.')[0] || moduleId;
  const sectionNames: Record<string, string> = {
    Inputs: 'inputs',
    State: 'state',
    Outputs: 'outputs',
    Internals: 'internals',
  };

  const visit = (node: UnitDomainNodeSpec, section?: string): void => {
    const nextSection = sectionNames[node.tag] ?? section;
    if (node.id && /^(Signal|Computed|Processor|Async|Consumer)Node$/.test(node.tag)) {
      const kind = node.tag.replace(/Node$/, '').toLowerCase();
      const slot = typeof node.data.slot === 'string'
        ? node.data.slot
        : `${nextSection ?? (kind === 'signal' ? 'state' : 'internals')}.${node.id}`;
      const flags = node.data.flags && typeof node.data.flags === 'object'
        ? node.data.flags as SerializableRecord
        : undefined;
      if (kind === 'signal') {
        nodes.push({
          kind: 'signal',
          id: node.id,
          slot,
          initial: (node.data.initial ?? null) as SerializableValue,
          ...(flags ? { flags } : {}),
        });
      } else {
        const type = typeof node.data.type === 'string' ? node.data.type as HalfcodeRef : undefined;
        const base = {
          id: node.id,
          slot,
          deps: stringArray(node.data.deps),
          logicId: `${family}.${node.id}`,
          ...(type ? { type } : {}),
          ...(flags ? { flags } : {}),
        };
        if (kind === 'computed') nodes.push({ kind: 'computed', ...base });
        if (kind === 'processor') {
          nodes.push({ kind: 'processor', ...base, outputs: stringArray(node.data.outputs) });
        }
        if (kind === 'async') {
          const raw = node.data.projections;
          const projections = raw && typeof raw === 'object' && !Array.isArray(raw)
            ? {
                ...(typeof (raw as Record<string, unknown>).result === 'string'
                  ? { result: (raw as Record<string, string>).result }
                  : {}),
                ...(typeof (raw as Record<string, unknown>).loading === 'string'
                  ? { loading: (raw as Record<string, string>).loading }
                  : {}),
                ...(typeof (raw as Record<string, unknown>).error === 'string'
                  ? { error: (raw as Record<string, string>).error }
                  : {}),
              }
            : undefined;
          nodes.push({
            kind: 'async',
            ...base,
            initial: (node.data.initial ?? null) as SerializableValue,
            ...(projections && Object.keys(projections).length ? { projections } : {}),
          });
        }
        if (kind === 'consumer') nodes.push({ kind: 'consumer', ...base });
      }
    }
    for (const child of node.children ?? []) visit(child, nextSection);
  };
  if (moduleNode) visit(moduleNode);

  const src = typeof moduleNode?.data.src === 'string' ? moduleNode.data.src : undefined;
  return {
    id: moduleId,
    ...(src ? { src: src as DataGraphModulePlan['src'] } : {}),
    nodes,
  };
}

function compileDataGraphScopePlan(
  unit: UnitCompileUnit,
  scopeId: string,
  bindings: DataGraphBindingsSpec,
): DataGraphScopePlan {
  const seeds = domainNodeIndex(unit.domains['data.graph.seed']);
  return {
    objects: bindings.objects,
    mounts: bindings.mounts.map((mount) => {
      const moduleId = refAnchor(mount.module) ?? mount.module;
      const seedId = mount.seed ? refAnchor(mount.seed) : undefined;
      const values = seedId ? seeds.get(seedId)?.data.values : undefined;
      return {
        ...mount,
        scopeId: mount.scope ?? scopeId,
        module: compileGraphModule(unit, moduleId),
        ...(values && typeof values === 'object' && !Array.isArray(values)
          ? { seedValues: values as SerializableRecord }
          : {}),
      };
    }),
    extensions: bindings.extensions,
  };
}

function compileUnitScopes(unit: UnitCompileUnit): ScopeRuntimePlan[] {
  const plans: ScopeRuntimePlan[] = [];
  // A unit has one Elements root and its runtime map is namespaced by unitFqn,
  // so the predefined root id remains the stable external lookup identity.
  const rootScopeId = scopeUseId(unit.elements?.scope);
  const rootPlan = unit.elements?.scope && rootScopeId
    ? scopePlanFromUse(unit, unit.elements.scope, rootScopeId, unit.elements.id, undefined)
    : undefined;
  if (rootPlan) plans.push(rootPlan);

  const visit = (nodes: UnitElementNode[] | undefined, inheritedScopeId: string | undefined): void => {
    for (const node of nodes ?? []) {
      const ownScopeId = ownedScopeOccurrenceId(node);
      const ownPlan = node.kind === 'capsule' && node.scope && ownScopeId
        ? scopePlanFromUse(unit, node.scope, ownScopeId, node.id, inheritedScopeId)
        : undefined;
      if (ownPlan) plans.push(ownPlan);
      const scopeId = ownScopeId ?? inheritedScopeId;
      visit(node.children, scopeId);
      for (const slot of node.slots ?? []) visit(slot.children, scopeId);
    }
  };

  visit(unit.elements?.children, rootScopeId);
  return plans;
}

function resolveConfigValue(
  ref: string | undefined,
  configNodes: Map<string, UnitDomainNodeSpec>,
): SerializableValue | undefined {
  if (!ref) return undefined;
  const parsed = safeParseRef(ref);
  const anchor = parsed?.id ?? parsed?.path;
  if (!anchor) return undefined;
  let value: unknown = configNodes.get(anchor)?.data;
  for (const segment of parsed?.subPath?.split('/').filter(Boolean) ?? []) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return value as SerializableValue | undefined;
}

function compileUnitDispatchEntries(unit: UnitCompileUnit): MessageDispatchPlanEntry[] {
  const entries: MessageDispatchPlanEntry[] = [];
  const commands = domainNodeIndex(unit.domains.commands);
  const configs = domainNodeIndex(unit.domains.config);
  const rootScopeId = scopeUseId(unit.elements?.scope);

  const visit = (nodes: UnitElementNode[] | undefined, inheritedScopeId: string | undefined): void => {
    for (const node of nodes ?? []) {
      const scopeId = ownedScopeOccurrenceId(node) ?? inheritedScopeId;
      if (node.kind === 'instance' && node.command && scopeId) {
        const commandType = refAnchor(node.command);
        const declaration = commandType ? commands.get(commandType) : undefined;
        const stringField = (name: string): string | undefined =>
          typeof declaration?.data[name] === 'string' ? declaration.data[name] as string : undefined;
        const payloadDef = stringField('payloadDef');
        const handler = stringField('handler');
        const configRef = stringField('config');
        entries.push({
          unitFqn: unit.fqn,
          elementId: node.id,
          scopeId,
          kind: 'command',
          command: node.command,
          commandType: commandType ?? node.command,
          ...(payloadDef ? { payloadDef: payloadDef as MessageDispatchPlanEntry['payloadDef'] } : {}),
          ...(handler ? { handler: handler as MessageDispatchPlanEntry['handler'] } : {}),
          ...(configRef ? { config: resolveConfigValue(configRef, configs) } : {}),
        });
      }
      visit(node.children, scopeId);
      for (const slot of node.slots ?? []) visit(slot.children, scopeId);
    }
  };

  visit(unit.elements?.children, rootScopeId);
  return entries;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Compile a loaded v3 unit bundle into admin shell / render / wiring plans
 * plus compile diagnostics. Pure projection over serializable input — no IO,
 * no XNL parsing, no adapter execution. The v2 compileHalfcode path is a
 * separate entry point and is not touched by this compiler.
 */
export function compileHalfcodeUnitBundle(input: UnitCompileInput): UnitCompileResult {
  const diagnostics: UnitCompileDiagnostic[] = [];
  const routeIndex = buildRouteIndex(input.app.routes);

  // 1. Route tree → admin shell plan (+ urlInputs matching per route).
  const routes = input.app.routes.map((route) => projectRoute(route, input, diagnostics));
  const adminShellPlan: AdminShellPlanV3 = {
    id: `${input.manifest.id}.admin-shell-plan-v3`,
    bundleId: input.manifest.id,
    product: input.app.product,
    routes,
  };

  // 2. Per-unit element checks: embedded page urlInputs, component props,
  //    capsule Requires along the scope chain.
  for (const unit of Object.values(input.units)) {
    checkUnitInstances(unit, input, diagnostics);
    checkUnitRequires(unit, diagnostics);
  }

  // 3. Wiring plan + unwired page messages.
  const wires = compileWiring(input, routeIndex, diagnostics);
  checkUnwiredMessages(input, routeIndex, wires, diagnostics);
  const wiringPlan = { id: `${input.manifest.id}.wiring-plan`, wires };

  // 4. Per-unit render plans (all element categories, refs preserved).
  const renderPlans = Object.values(input.units)
    .filter((unit) => unit.elements)
    .map((unit) => projectUnitRenderPlan(unit, input));

  // 5. Runtime-facing plans. This is the last layer allowed to inspect
  //    structured domain nodes; assemblers and renderers consume only plans.
  const scopeRuntimePlans = Object.values(input.units).flatMap(compileUnitScopes);
  const messageDispatchPlan = {
    id: `${input.manifest.id}.message-dispatch-plan`,
    entries: Object.values(input.units).flatMap(compileUnitDispatchEntries),
  };

  return {
    adminShellPlan,
    renderPlans,
    wiringPlan,
    scopeRuntimePlans,
    messageDispatchPlan,
    diagnostics,
  };
}
