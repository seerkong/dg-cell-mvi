/**
 * dg-cell-mvi-admin-logic · effects/permissionEffects — the permission actor's remote-load side effect
 * (DEPA Effect 维). The permission codes are a 1-级 REMOTE-LOADED fact (design §A); this is the impure
 * boundary that loads them, shaped as the DEPA `fn(runtime, input, config)` seam:
 *   - runtime  = the INJECTED ports (`{ http }`, an admin-contract interface) — the only IO surface.
 *   - input    = the `EffectRequest` (the `permission/load` request the reduce emitted).
 *   - config   = the codes endpoint/method, closed over by the factory.
 *
 * `createPermissionEffects(ports, config)` returns the `EffectHandler<PermissionState>` map the actor
 * store runs. logic NEVER imports a concrete IO module — it depends only on the HttpPort *interface*; the
 * app injects the concrete impl (admin-support's axios HttpPort / the dev mock) at assembly time.
 *
 * `permission/load` → `http.request(codesUrl)` → on success回流 `[setCodes(codes), permissionLoaded({codes})]`
 * (the fact write + the cross-actor message that announces "codes resolved" so a menu re-projects). On
 * FAILURE it回流s nothing — the codes fact is left untouched (a failed load must never blank the menu);
 * the codes stay whatever they were (`[]` on first load = the safe "no extra perms" default).
 *
 * Mirrors authEffects.ts (createAuthEffects: inject port → call → re-dispatch success/feedback) — the
 * SAME范式, one handler. Borrows the reference admin's codes API shape (`/sys/authority/user/permissions`
 * post), but NORMALIZES the response to the flat `codes[]` this chassis owns: the backend may return a
 * flat `string[]` OR the reference's permission/resource TREE (nodes carrying `.permission` + `.children`)
 * — `flattenCodes` collects every `.permission` recursively, matching the reference `formatPermissions`.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';
import {
  PERMISSION_EFFECT,
  setCodes,
  permissionLoaded,
} from 'dg-cell-mvi-admin-contract';
import type { HttpPort, HttpMethod, PermissionState } from 'dg-cell-mvi-admin-contract';

/** The injected runtime ports — the ONLY IO surface the permission load touches (Effect-维 seam). */
export interface PermissionPorts {
  /** transport seam (admin-support's axios impl in the app; a fake in tests). Required to load codes. */
  http?: HttpPort;
}

/** Endpoint/method config closed over by the factory (the `config` of `fn(runtime,input,config)`). */
export interface PermissionEffectsConfig {
  /** the codes endpoint path (resolved against the HttpPort baseURL). Default `/sys/authority/user/permissions`. */
  codesUrl?: string;
  /** the codes HTTP method. Default `post` (the reference admin posts the permissions call). */
  codesMethod?: HttpMethod;
}

/** Canonical defaults (borrowed from the reference admin's API shape, port-ized). */
const DEFAULTS: Required<PermissionEffectsConfig> = {
  codesUrl: '/sys/authority/user/permissions',
  codesMethod: 'post',
};

/**
 * Normalize an arbitrary codes response to a flat `string[]`.
 *   - a flat `string[]`            → kept as-is (deduped, non-empty strings only);
 *   - a permission/resource TREE   → every node's `.permission` collected recursively (ref
 *                                    `formatPermissions`): `[{permission, children:[{permission}]}]`;
 *   - `null`/`undefined`/other     → `[]` (a soft, safe empty — "no extra perms").
 */
function flattenCodes(data: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (code: unknown) => {
    if (typeof code === 'string' && code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  };
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (typeof node === 'string') {
        push(node); // already a flat code
      } else if (node && typeof node === 'object') {
        const n = node as { permission?: unknown; children?: unknown };
        push(n.permission); // a tree node — collect its code
        if (n.children) walk(n.children); // …and recurse (multi-level resource tree)
      }
    }
  };
  walk(data);
  return out;
}

/**
 * Build the permission effect-handler map for the permission actor.
 *
 * @param ports  injected runtime ports `{ http }` (the Effect-维 seam) — logic's only IO.
 * @param config codes endpoint/method overrides (default borrowed from the reference admin).
 */
export function createPermissionEffects(
  ports: PermissionPorts = {},
  config: PermissionEffectsConfig = {},
): Record<string, EffectHandler<PermissionState>> {
  const { http } = ports;
  // coalesce per-field so an explicit `undefined` threaded in does NOT clobber the default.
  const cfg: Required<PermissionEffectsConfig> = {
    codesUrl: config.codesUrl ?? DEFAULTS.codesUrl,
    codesMethod: config.codesMethod ?? DEFAULTS.codesMethod,
  };

  // --- permission/load : fetch the codes → setCodes回流 + publish permissionLoaded. On failure, no回流
  //     (codes untouched — a failed load never blanks the menu; the existing/empty codes stand).
  const loadPermissions: EffectHandler<PermissionState> = async (_rt) => {
    if (!http) return; // no transport → nothing to load (degrade quietly; not a hard error).
    try {
      const data = await http.request<unknown>({ url: cfg.codesUrl, method: cfg.codesMethod });
      const codes = flattenCodes(data);
      // success回流: write the fact (setCodes) AND announce it across actors (permissionLoaded → menu
      // re-projects). The order matters only for observers of the message — both run in one feedback batch.
      return [setCodes(codes), permissionLoaded({ codes })];
    } catch {
      // failure: leave codes as-is (safe). The page stays usable; a transient codes-load failure must not
      // strand the user or wipe their menu. (A 401 here is handled by the HttpPort interceptor → logout.)
      return;
    }
  };

  return {
    [PERMISSION_EFFECT.loadPermissions]: loadPermissions,
  };
}
