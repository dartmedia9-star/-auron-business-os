import { OBJECT_DEFS } from "./catalog";
import { boundsOf, convexOverlap, dist, isSelfIntersecting, pointInPolygon, polygonArea } from "./geometry";
import { edgesOf, objectFootprint, openingGeometry } from "./model";
import type { ProjectModel, Vec2 } from "./schema";
import { formatLength, type DisplayUnit } from "./units";

// Geometry checks shown to the user as warnings. They never change the model:
// the user decides how to correct anything flagged here. None of this is a
// building-code, fire-safety or structural check.

export type Issue = {
  /** Stable key so the UI can list and dismiss consistently. */
  key: string;
  entityId: string | null;
  severity: "error" | "warning";
  message: string;
};

const insideAnyRoom = (model: ProjectModel, pts: Vec2[]): boolean =>
  model.rooms.some((room) => !room.hidden && pts.every((p) => pointInPolygon(p, room.points, 1)));

export function validateModel(model: ProjectModel): Issue[] {
  const issues: Issue[] = [];
  const unit: DisplayUnit = model.settings.displayUnit;
  const fmt = (mm: number) => formatLength(mm, unit);

  const ids = new Set<string>();
  const all = [
    ...model.rooms,
    ...model.partitions,
    ...model.openings,
    ...model.pillars,
    ...model.sections,
    ...model.objects,
    ...model.dimensions,
    ...model.labels,
  ];
  for (const e of all) {
    if (ids.has(e.id)) issues.push({ key: `dup:${e.id}`, entityId: e.id, severity: "error", message: `Two items share the id ${e.id}` });
    ids.add(e.id);
  }

  for (const room of model.rooms) {
    edgesOf(room.points).forEach((e) => {
      if (e.length < 1) issues.push({ key: `zero:${room.id}:${e.index}`, entityId: room.id, severity: "error", message: `${room.name}: wall ${e.index + 1} has no length` });
    });
    if (isSelfIntersecting(room.points)) issues.push({ key: `self:${room.id}`, entityId: room.id, severity: "error", message: `${room.name}: walls cross each other` });
    else if (polygonArea(room.points) < 1e5) issues.push({ key: `tiny:${room.id}`, entityId: room.id, severity: "warning", message: `${room.name} is smaller than 0.1 m²` });
  }

  for (const p of model.partitions) {
    edgesOf(p.points, false).forEach((e) => {
      if (e.length < 1) issues.push({ key: `zero:${p.id}:${e.index}`, entityId: p.id, severity: "error", message: `${p.name}: segment ${e.index + 1} has no length` });
    });
  }

  const byEdge = new Map<string, Array<{ id: string; from: number; to: number; name: string }>>();
  for (const o of model.openings) {
    const g = openingGeometry(model, o);
    if (!g) {
      issues.push({ key: `orphan:${o.id}`, entityId: o.id, severity: "error", message: `${o.name} is not attached to a wall` });
      continue;
    }
    if (g.overflows) issues.push({ key: `overflow:${o.id}`, entityId: o.id, severity: "warning", message: `${o.name} runs past the end of its ${fmt(g.edgeLength)} wall` });
    if (o.sill + o.height > g.wallHeight + 0.5) issues.push({ key: `tall:${o.id}`, entityId: o.id, severity: "warning", message: `${o.name} is taller than its wall (${fmt(g.wallHeight)})` });
    const key = `${o.hostId}:${o.startVertexId}`;
    const list = byEdge.get(key) ?? [];
    list.push({ id: o.id, from: o.offset, to: o.offset + o.width, name: o.name });
    byEdge.set(key, list);
  }
  for (const list of byEdge.values()) {
    list.sort((a, b) => a.from - b.from);
    for (let i = 1; i < list.length; i++) {
      if (list[i].from < list[i - 1].to - 0.5) {
        issues.push({ key: `openlap:${list[i].id}`, entityId: list[i].id, severity: "warning", message: `${list[i].name} overlaps ${list[i - 1].name} on the same wall` });
      }
    }
  }

  const hasRooms = model.rooms.some((r) => !r.hidden);

  for (const s of model.sections) {
    const pts = objectFootprint(s);
    if (hasRooms && !insideAnyRoom(model, pts)) issues.push({ key: `secout:${s.id}`, entityId: s.id, severity: "warning", message: `${s.name} does not fit inside the room` });
  }
  for (let i = 0; i < model.sections.length; i++) {
    for (let j = i + 1; j < model.sections.length; j++) {
      const a = model.sections[i];
      const b = model.sections[j];
      if (a.hidden || b.hidden) continue;
      if (convexOverlap(objectFootprint(a), objectFootprint(b), 1)) {
        issues.push({ key: `seclap:${a.id}:${b.id}`, entityId: b.id, severity: "warning", message: `${b.name} overlaps ${a.name}` });
      }
    }
  }

  for (const p of model.pillars) {
    if (hasRooms && !insideAnyRoom(model, objectFootprint(p))) issues.push({ key: `pilout:${p.id}`, entityId: p.id, severity: "warning", message: `${p.name} is outside the room` });
  }

  const ceiling = model.venue.ceilingHeight;
  for (const o of model.objects) {
    const pts = objectFootprint(o);
    if (hasRooms && !insideAnyRoom(model, pts)) issues.push({ key: `objout:${o.id}`, entityId: o.id, severity: "warning", message: `${o.name} is outside the room` });
    const top = o.elevation + o.height;
    if (ceiling != null && top > ceiling + 0.5) issues.push({ key: `objceil:${o.id}`, entityId: o.id, severity: "warning", message: `${o.name} is ${fmt(top)} high, above the recorded ceiling height (${fmt(ceiling)})` });
  }
  // Solid objects whose volumes intersect (frames people walk through, such as a box arch, are left out).
  const solids = model.objects.filter((o) => !o.hidden && !OBJECT_DEFS[o.type].open);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i];
      const b = solids[j];
      const zOverlap = a.elevation < b.elevation + b.height - 0.5 && b.elevation < a.elevation + a.height - 0.5;
      if (!zOverlap) continue;
      if (convexOverlap(objectFootprint(a), objectFootprint(b), 1)) {
        const hint = OBJECT_DEFS[b.type].surface || OBJECT_DEFS[a.type].surface ? " (set the elevation if one stands on the other)" : "";
        issues.push({ key: `objlap:${a.id}:${b.id}`, entityId: b.id, severity: "warning", message: `${b.name} intersects ${a.name}${hint}` });
      }
    }
  }

  for (const d of model.dimensions) {
    if (dist(d.a, d.b) < 1) issues.push({ key: `dimzero:${d.id}`, entityId: d.id, severity: "warning", message: "A dimension has no length" });
  }

  return issues;
}

/** Overall internal extents of the drawing's rooms, for the summary. */
export function overallExtents(model: ProjectModel): { width: number; length: number } | null {
  const b = boundsOf(model.rooms.filter((r) => !r.hidden).flatMap((r) => r.points));
  return b ? { width: b.maxX - b.minX, length: b.maxY - b.minY } : null;
}
