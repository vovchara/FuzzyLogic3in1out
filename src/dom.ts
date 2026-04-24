export function q<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing selector: ${selector}`);
  return el as T;
}

export function qa<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T[] {
  return Array.from(root.querySelectorAll(selector)) as T[];
}

export function applyI18n(root: ParentNode, t: (key: string) => string): void {
  for (const el of qa(root, "[data-i18n]")) {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  }
  for (const el of qa(root, "[data-i18n-title]")) {
    const key = el.dataset.i18nTitle!;
    el.title = t(key);
  }
  for (const el of qa<HTMLInputElement>(root, "[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder!;
    el.placeholder = t(key);
  }
  for (const el of qa(root, "[data-i18n-aria-label]")) {
    const key = el.dataset.i18nAriaLabel!;
    el.setAttribute("aria-label", t(key));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}
