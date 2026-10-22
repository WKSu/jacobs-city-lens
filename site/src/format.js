import { format } from "d3";

export function formatter(metric) {
  const f = format(metric.format || ".2f");
  return (v) => (v === null || v === undefined || Number.isNaN(v) ? "–" : f(v));
}

export function withUnit(metric, v) {
  const s = formatter(metric)(v);
  if (s === "–" || metric.unit === "share" || metric.unit === "0–1") return s;
  return `${s} ${metric.unit}`;
}
