// Read design tokens from CSS so charts and the map follow light/dark mode.
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

export function sequential() {
  return [1, 2, 3, 4, 5, 6, 7].map((i) => token(`seq-${i}`));
}

export function roleColor(role) {
  return token(role === "jacobs" ? "series-1" : "series-2");
}

export const ROLE_LABEL = { jacobs: "Old, Jacobs-style district", planned: "Planned district" };

export function onThemeChange(fn) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
