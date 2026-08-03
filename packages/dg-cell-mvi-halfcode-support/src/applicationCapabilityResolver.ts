const MAX_CAPABILITY_PROTOTYPE_DEPTH = 32;
const FUNCTION_TO_STRING = Function.prototype.toString;
const NATIVE_FUNCTION_BRAND = /\{\s*\[native code\]\s*\}/;
const GLOBAL_PLATFORM_PROTOTYPES = collectGlobalPlatformPrototypes();

export type ApplicationDataCapabilityResolution =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Resolves an explicit application capability without executing accessors or
 * accepting capabilities inherited from native/platform prototype boundaries.
 */
export function resolveApplicationDataCapability(
  owner: unknown,
  key: string,
): ApplicationDataCapabilityResolution {
  if (owner === null || (typeof owner !== 'object' && typeof owner !== 'function')) {
    return { ok: false, reason: 'owner must be an object' };
  }
  const visited = new Set<object>();
  let current: object | null = owner;
  for (let depth = 0; current !== null; depth += 1) {
    if (depth >= MAX_CAPABILITY_PROTOTYPE_DEPTH) {
      return { ok: false, reason: 'exceeded the prototype inspection limit' };
    }
    if (visited.has(current)) {
      return { ok: false, reason: 'encountered a cyclic prototype chain' };
    }
    visited.add(current);

    if (depth > 0) {
      const boundary = inspectApplicationPrototype(current);
      if (!boundary.ok) return boundary;
    }

    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return { ok: false, reason: 'could not be inspected safely' };
    }
    if (descriptor !== undefined) {
      if (!('value' in descriptor)) {
        return { ok: false, reason: 'must not be accessor-backed' };
      }
      return { ok: true, value: descriptor.value };
    }

    try {
      current = Object.getPrototypeOf(current) as object | null;
    } catch {
      return { ok: false, reason: 'prototype could not be inspected safely' };
    }
  }
  return { ok: false, reason: 'is missing' };
}

type ApplicationPrototypeInspection =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

function inspectApplicationPrototype(prototype: object): ApplicationPrototypeInspection {
  if (GLOBAL_PLATFORM_PROTOTYPES.has(prototype)) {
    return { ok: false, reason: 'reached a global platform prototype boundary' };
  }
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(prototype);
  } catch {
    return { ok: false, reason: 'encountered a prototype that could not be inspected safely' };
  }
  for (const key of keys) {
    const descriptor = safeDescriptor(prototype, key);
    if (descriptor === undefined) {
      return { ok: false, reason: 'encountered an unstable prototype descriptor' };
    }
    if ('value' in descriptor) {
      if (isNativeFunction(descriptor.value)) {
        return { ok: false, reason: 'reached a native intrinsic prototype boundary' };
      }
      continue;
    }
    if (isNativeFunction(descriptor.get) || isNativeFunction(descriptor.set)) {
      return { ok: false, reason: 'reached a native intrinsic prototype boundary' };
    }
  }
  return { ok: true };
}

function collectGlobalPlatformPrototypes(): ReadonlySet<object> {
  const prototypes = new Set<object>();
  const visited = new Set<object>();
  const pending: object[] = [globalThis];
  while (pending.length > 0) {
    const namespace = pending.pop()!;
    if (visited.has(namespace)) continue;
    visited.add(namespace);
    let keys: readonly PropertyKey[];
    try {
      keys = Reflect.ownKeys(namespace);
    } catch {
      continue;
    }
    for (const key of keys) {
      const descriptor = safeDescriptor(namespace, key);
      if (descriptor === undefined || !('value' in descriptor)) continue;
      const value = descriptor.value;
      if ((typeof value !== 'function' && typeof value !== 'object') || value === null) continue;
      const prototypeDescriptor = safeDescriptor(value, 'prototype');
      if (
        prototypeDescriptor !== undefined
        && 'value' in prototypeDescriptor
        && typeof prototypeDescriptor.value === 'object'
        && prototypeDescriptor.value !== null
        && (isNativeFunction(value) || hasPlatformPrototypeBrand(prototypeDescriptor.value))
      ) {
        prototypes.add(prototypeDescriptor.value);
      }
      if (isDescriptorNamespace(value)) pending.push(value);
    }
  }
  return prototypes;
}

function hasPlatformPrototypeBrand(prototype: object): boolean {
  const descriptor = safeDescriptor(prototype, Symbol.toStringTag);
  return descriptor !== undefined
    && 'value' in descriptor
    && typeof descriptor.value === 'string'
    && descriptor.value.trim().length > 0
    && descriptor.value !== 'Object';
}

function isDescriptorNamespace(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function safeDescriptor(value: object, key: PropertyKey): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return undefined;
  }
}

function isNativeFunction(value: unknown): boolean {
  if (typeof value !== 'function') return false;
  try {
    return NATIVE_FUNCTION_BRAND.test(Function.prototype.call.call(FUNCTION_TO_STRING, value));
  } catch {
    return true;
  }
}
