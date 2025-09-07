// src/lib/cip57/params.ts
import type { Cip57Arg } from "./types";

export type ParamType = "bytes" | "integer" | "string" | "boolean" | "unknown";

export type ParamDescriptor = {
  name: string;
  type: ParamType;
  semantics?: "PolicyId" | "AssetName";
  minBytes?: number;
  maxBytes?: number;
  validate: (raw: string) => string | null;
  coerce: (raw: string) => unknown;
};

// resolve JSON $ref like "#/definitions/cardano/assets/PolicyId"
function resolveRef(ref: string, defs: Record<string, unknown>): any {
  const path = ref.replace(/^#\//, "").split("/");
  let cur: any = { definitions: defs };
  for (const p of path) cur = cur?.[p];
  return cur;
}

export function buildParamDescriptors(
  validator: { parameters?: (Cip57Arg | { oneOf: Cip57Arg[] })[] },
  definitions: Record<string, unknown> = {}
): ParamDescriptor[] {
  if (!validator.parameters) return [];

  const flatten = (arg?: Cip57Arg | { oneOf: Cip57Arg[] }) =>
    arg && "oneOf" in (arg as any) ? (arg as any).oneOf as Cip57Arg[] : (arg ? [arg as Cip57Arg] : []);

  const out: ParamDescriptor[] = [];

  for (const paramChoice of validator.parameters) {
    const candidates = flatten(paramChoice);
    const p = candidates[0]; // pick first if multiple
    const name = p?.title || "param";

    let schema: any = p?.schema;
    if (schema && "$ref" in schema) schema = resolveRef(schema.$ref, definitions);

    let type: ParamType = "unknown";
    let semantics: ParamDescriptor["semantics"];
    let minBytes: number | undefined;
    let maxBytes: number | undefined;

    if (schema?.dataType === "bytes") type = "bytes";
    else if (schema?.dataType === "integer") type = "integer";
    else if (schema?.dataType === "string") type = "string";
    else if (schema?.dataType === "boolean") type = "boolean";

    // Recognize special Cardano refs
    const refName = (p?.schema as any)?.$ref as string | undefined;
    if (refName?.includes("cardano~1assets~1PolicyId") || schema?.title === "PolicyId") {
      type = "bytes";
      semantics = "PolicyId";
      minBytes = maxBytes = 28;
    }
    if (refName?.includes("cardano~1assets~1AssetName") || schema?.title === "AssetName") {
      type = "bytes";
      semantics = "AssetName";
      maxBytes = 32;
    }

    const validate: ParamDescriptor["validate"] = (raw) => {
      if (type === "integer") {
        return /^-?\d+$/.test(raw) ? null : "Expected an integer";
      }
      if (type === "boolean") {
        return /^(true|false)$/i.test(raw) ? null : "Expected true/false";
      }
      if (type === "bytes") {
        const s = raw.startsWith("0x") ? raw.slice(2) : raw;
        if (!/^[0-9a-fA-F]*$/.test(s)) return "Expected hex";
        if (s.length % 2 !== 0) return "Hex length must be even";
        const bytes = s.length / 2;
        if (minBytes && bytes < minBytes) return `Too short: need ${minBytes} bytes`;
        if (maxBytes && bytes > maxBytes) return `Too long: max ${maxBytes} bytes`;
        return null;
      }
      return null; // string/unknown always ok
    };

    const coerce: ParamDescriptor["coerce"] = (raw) => {
      if (type === "integer") return Number(raw);
      if (type === "boolean") return /^true$/i.test(raw);
      if (type === "bytes") {
        const looksHex = /^[0-9a-fA-F]+$/.test(raw.replace(/^0x/, ""));
        if (looksHex) return raw.replace(/^0x/, "");
        // else encode as UTF-8 → hex
        const enc = new TextEncoder().encode(raw);
        return Array.from(enc).map(b => b.toString(16).padStart(2, "0")).join("");
      }
      return raw;
    };

    out.push({ name, type, semantics, minBytes, maxBytes, validate, coerce });
  }

  return out;
}