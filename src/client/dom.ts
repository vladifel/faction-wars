/** Minimal DOM builder (Devvit Web — no JSX runtime). */

type Attrs = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | false | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'style') node.setAttribute('style', String(v));
    else if (k === 'tabindex' || k === 'tabIndex') node.tabIndex = Number(v);
    else if (k.startsWith('aria-') || k === 'role') node.setAttribute(k, String(v));
    else if (k.startsWith('data-')) node.setAttribute(k, String(v));
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else (node as Record<string, unknown>)[k] = v;
  }
  for (const child of children) {
    if (!child) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}
