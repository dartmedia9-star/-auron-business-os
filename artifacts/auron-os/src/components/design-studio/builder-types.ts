import { createContext, useContext } from "react";
import type { DesignObject as LibraryObject } from "@workspace/api-client-react";
import { parseCustomDefinition, specToContent, type CustomDefinition, type CustomSpec, type TemplateId } from "@workspace/design-model";
import type { CustomPlacement } from "./store";

// Shared between the object library, the inspector and the (lazy-loaded)
// Custom Builder, so opening the builder doesn't pull its code into the editor.

export type { LibraryObject };

/** What the Custom Builder is opened for. */
export type BuilderRequest =
  | { kind: "new"; template?: TemplateId }
  /** Edit the reusable definition saved in My Custom Objects. */
  | { kind: "library"; item: LibraryObject }
  /** Edit one placed object only (its own copy of the recipe). */
  | { kind: "instance"; objectId: string; name: string; spec: CustomSpec; color: string; accentColor: string; libraryId: number | null };

export type ParsedLibraryObject = { item: LibraryObject; definition: CustomDefinition | null; error: string | null };

export function parseLibraryObject(item: LibraryObject): ParsedLibraryObject {
  const r = parseCustomDefinition(item.definition);
  return r.ok ? { item, definition: r.definition, error: null } : { item, definition: null, error: r.error };
}

export function placementFor(item: LibraryObject, d: CustomDefinition): CustomPlacement {
  return { spec: d.spec, name: item.name, color: d.color, accentColor: d.accentColor, elevation: d.elevation, libraryId: item.id, libraryRevision: item.revision };
}

/** An API error as a sentence for a toast (without the "HTTP 400 Bad Request:" prefix). */
export function plainError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^HTTP \d+[^:]*:\s*/, "") || "Something went wrong.";
}

/** Opens the Custom Builder from anywhere inside the editor. */
export const OpenBuilderContext = createContext<((req: BuilderRequest) => void) | null>(null);
export const useOpenBuilder = () => useContext(OpenBuilderContext);

/** A library definition made from a placed object's recipe (its original drawing isn't kept on the instance). */
export function definitionFromSpec(spec: CustomSpec, color: string, accentColor: string, elevation = 0): CustomDefinition {
  return { v: 1, ...specToContent(spec), spec, color, accentColor, elevation };
}

/** Deep equality ignoring key order (the database returns JSON with sorted keys). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
