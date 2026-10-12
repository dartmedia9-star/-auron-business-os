import { memo } from "react";
import type { Prim, Role, Style } from "./plan-primitives";

// Draws plan primitives as SVG in plan millimetres. Pixel sizes are divided
// by the current zoom so strokes and labels keep their on-screen size.
// Colours come from the --plan-* tokens (index.css), which follow the
// Midnight / Daylight appearance; entity colours (sections, objects) are
// the user's own choice and are drawn as given.

const ROLE: Record<Role, { stroke: string; fill: string; width: number; dash?: number[] }> = {
  roomFill: { stroke: "none", fill: "var(--plan-floor)", width: 0 },
  wall: { stroke: "var(--plan-ink)", fill: "var(--plan-wall)", width: 1.4 },
  wallEdge: { stroke: "var(--plan-ink)", fill: "none", width: 2 },
  partition: { stroke: "var(--plan-ink)", fill: "var(--plan-partition)", width: 1.1 },
  openingGap: { stroke: "none", fill: "var(--plan-floor)", width: 0 },
  opening: { stroke: "var(--plan-ink)", fill: "none", width: 1.2 },
  swing: { stroke: "var(--plan-muted)", fill: "none", width: 1, dash: [4, 3] },
  window: { stroke: "var(--plan-ink)", fill: "none", width: 1 },
  pillar: { stroke: "var(--plan-ink)", fill: "var(--plan-pillar)", width: 1.2 },
  section: { stroke: "var(--plan-muted)", fill: "var(--plan-muted)", width: 1.2, dash: [7, 4] },
  object: { stroke: "var(--plan-ink)", fill: "var(--plan-object)", width: 1.2 },
  objectLine: { stroke: "var(--plan-ink)", fill: "none", width: 0.9 },
  dim: { stroke: "var(--plan-dim)", fill: "var(--plan-dim)", width: 1 },
  dimText: { stroke: "var(--plan-floor)", fill: "var(--plan-dim)", width: 3.5 },
  label: { stroke: "var(--plan-floor)", fill: "var(--plan-text)", width: 3.5 },
  roomLabel: { stroke: "var(--plan-floor)", fill: "var(--plan-text-muted)", width: 3.5 },
  muted: { stroke: "var(--plan-muted)", fill: "var(--plan-muted)", width: 1 },
};

function resolve(style: Style) {
  const base = ROLE[style.role];
  return {
    stroke: style.stroke ?? base.stroke,
    fill: style.fill ?? base.fill,
    width: style.width ?? base.width,
    dash: style.dash ?? base.dash,
    fillOpacity: style.fillOpacity,
  };
}

const pathOf = (pts: Array<{ x: number; y: number }>, closed: boolean) =>
  pts.length === 0 ? "" : `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}${closed ? "Z" : ""}`;

export const PlanSvg = memo(function PlanSvg({ prims, scale }: { prims: Prim[]; scale: number }) {
  const px = (n: number) => n / scale;
  return (
    <g>
      {prims.map((p, i) => {
        if (p.k === "poly") {
          const s = resolve(p.style);
          const d = pathOf(p.pts, p.closed) + (p.holes ?? []).map((h) => pathOf(h, true)).join("");
          const filled = p.closed && s.fill !== "none";
          return (
            <path
              key={i}
              d={d}
              fillRule="evenodd"
              style={{
                fill: filled ? s.fill : "none",
                fillOpacity: filled ? s.fillOpacity : undefined,
                stroke: s.stroke,
                strokeWidth: px(s.width),
                strokeDasharray: s.dash ? s.dash.map(px).join(" ") : undefined,
                strokeLinejoin: "miter",
              }}
            />
          );
        }
        if (p.k === "circle") {
          const s = resolve(p.style);
          return <circle key={i} cx={p.c.x} cy={p.c.y} r={p.r} style={{ fill: s.fill, fillOpacity: s.fillOpacity, stroke: s.stroke, strokeWidth: px(s.width), strokeDasharray: s.dash ? s.dash.map(px).join(" ") : undefined }} />;
        }
        if (p.k === "arrow") {
          const s = resolve(p.style);
          const len = px(p.size);
          const w = len * 0.36;
          const bx = p.tip.x - p.dir.x * len;
          const by = p.tip.y - p.dir.y * len;
          const pts = `${p.tip.x},${p.tip.y} ${bx - p.dir.y * w},${by + p.dir.x * w} ${bx + p.dir.y * w},${by - p.dir.x * w}`;
          return <polygon key={i} points={pts} style={{ fill: s.stroke === "none" ? s.fill : s.stroke }} />;
        }
        const s = resolve(p.style);
        return (
          <text
            key={i}
            x={p.p.x}
            y={p.p.y}
            transform={p.angle ? `rotate(${p.angle} ${p.p.x} ${p.p.y})` : undefined}
            textAnchor={p.anchor}
            dominantBaseline={p.baseline === "middle" ? "central" : p.baseline === "bottom" ? "text-after-edge" : "text-before-edge"}
            style={{
              fontSize: px(p.size),
              fontWeight: p.weight === "bold" ? 600 : 500,
              fill: s.fill,
              stroke: p.halo ? (p.style.role === "dimText" || p.style.role === "label" || p.style.role === "roomLabel" ? ROLE[p.style.role].stroke : s.stroke) : "none",
              strokeWidth: p.halo ? px(ROLE[p.style.role].width) : 0,
              paintOrder: "stroke",
              strokeLinejoin: "round",
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
            }}
          >
            {p.text}
          </text>
        );
      })}
    </g>
  );
});
