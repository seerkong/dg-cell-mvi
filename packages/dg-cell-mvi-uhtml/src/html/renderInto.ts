/**
 * The single, auditable rendering entry for the view layer.
 *
 * Per the attractor doc's anti-pattern list: no scattered `innerHTML` in view code. All rendering
 * goes through `renderInto` (uhtml templates auto-escape interpolations; text uses `textContent`).
 * `renderTrustedHtml` is the ONE sanctioned non-auto-escaping entry — safe only because its input is
 * restricted to internal template output, it is the sole auditable site, and new `innerHTML` writes
 * elsewhere are forbidden by convention.
 */
import { html, svg, render } from 'uhtml';

export { html, svg, render };

/** Template hole produced by the `html` / `svg` tags. */
export type Renderable = ReturnType<typeof html>;

/** Render a uhtml template into a target element. The single sanctioned render call. */
export function renderInto(target: Element, template: unknown): void {
  // uhtml's render accepts a Hole at runtime; its types narrow `what` to Function|Node|Container.
  render(target, template as never);
}

/**
 * The ONLY sanctioned trusted-HTML injection point. Input must be internal template output only.
 * Pure-text content must use `textContent`; structured content must use `html` templates.
 */
export function renderTrustedHtml(target: Element, trustedHtml: string): void {
  target.innerHTML = trustedHtml;
}
