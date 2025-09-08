// src/lib/cip57/params.ts
// Spec-checked against CIP-57 (core vocabulary and keywords) and asset constraints.
// - CIP-57 dataType: integer | bytes | list | map | constructor
// - Discouraged: #string, #boolean, etc. (still handled if present)
// - PolicyId: exactly 28 bytes; AssetName: up to 32 bytes.

import type { Cip57Arg } from "./types";

// CIP-57-aligned primitives (plus "unknown" and optional '#' builtins if encountered)
export type ParamType =
  | "integer"
  | "bytes"
  | "list"
  | "map"
  | "constructor"
  | "builtin"   // for '#string', '#boolean', etc., if a blueprint uses them
  | "unknown";

export type ParamSemantics = "PolicyId" | "AssetName";

export type ParamDescriptorBase = {
  name: string;
  type: ParamType;
  semantics?: ParamSemantics;
  // bytes constraints (bytes length, not hex chars)
  minBytes?: number;
  maxBytes?: number;
  // integer constraints (BigInt-safe)
  minimum?: bigint;
  maximum?: bigint;
  exclusiveMaximum?: bigint;
  multipleOf?: bigint;
  // list/map limits
  maxItems?: number;
  // UI helpers
  description?: string;
  title?: string;
  // For top-level param choices / schema.oneOf (UI can render a selector)
  oneOfChoices?: ParamDescriptor[]; // normalized choices if present
  // Validation & coercion for primitive leaves (string input from form)
  validate: (raw: string) => string | null;
  coerce: (raw: string) => unknown;
};

export type ParamDescriptorList = ParamDescriptorBase & {
  type: "list";
  // If 'items' is a single schema → homogeneous list. If array → tuple/product fixed length.
  items?: ParamDescriptor | ParamDescriptor[];
};

export type ParamDescriptorMap = ParamDescriptorBase & {
  type: "map";
  keys?: ParamDescriptor;
  values?: ParamDescriptor;
};

export type ParamDescriptorConstructor = ParamDescriptorBase & {
  type: "constructor";
  // Ordered fields (tuples). Optional fixed tag could be added later if present.
  fields?: ParamDescriptor[];
};

export type ParamDescriptor =
  | (ParamDescriptorBase & { type: "bytes" | "integer" | "builtin" | "unknown" })
  | ParamDescriptorList
  | ParamDescriptorMap
  | ParamDescriptorConstructor;

// ---------- helpers ----------

// Resolve JSON $ref like "#/definitions/cardano/assets/PolicyId"
function resolveRef(ref: string, defs: Record<string, unknown>): any {
  const path = ref.replace(/^#\//, "").split("/");
  let cur: any = { definitions: defs };
  for (const p of path) cur = cur?.[p];
  return cur;
}

type Schema = any; // (CIP-57 schema node)

// Determine ParamType from CIP-57 dataType (including discouraged '#*')
function classifyDataType(schema: Schema): ParamType {
  const dt = schema?.dataType as string | undefined;
  if (!dt) return "unknown";
  if (dt === "integer" || dt === "bytes" || dt === "list" || dt === "map" || dt === "constructor")
    return dt;
  if (dt.startsWith("#")) return "builtin"; // '#string', '#boolean', '#integer', '#bytes', '#list', '#pair'...
  return "unknown";
}

function hexEven(raw: string) {
  const s = raw.startsWith("0x") ? raw.slice(2) : raw;
  return s.length % 2 === 0 ? s : "0" + s; // pad if needed before byte length check
}

function hexToByteLen(hex: string) {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  return s.length / 2;
}

function isHex(s: string) {
  const t = s.startsWith("0x") ? s.slice(2) : s;
  return /^[0-9a-fA-F]*$/.test(t);
}

function encodeUtf8ToHex(s: string) {
  const enc = new TextEncoder().encode(s);
  return Array.from(enc).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Detect well-known Cardano semantics to set strict byte bounds
function detectSemantics(arg: { schema?: any }, resolved: any): {
  semantics?: ParamSemantics;
  minBytes?: number;
  maxBytes?: number;
} {
  const refName = (arg?.schema as any)?.$ref as string | undefined;
  const title = resolved?.title as string | undefined;

  // PolicyId → exactly 28 bytes (blake2b-224); AssetName → up to 32 bytes.
  // Sources: CIP-26, CIP-14 / ecosystem docs.
  if (refName?.includes("cardano~1assets~1PolicyId") || title === "PolicyId") {
    return { semantics: "PolicyId", minBytes: 28, maxBytes: 28 };
  }
  if (refName?.includes("cardano~1assets~1AssetName") || title === "AssetName") {
    return { semantics: "AssetName", maxBytes: 32 };
  }
  return {};
}

// Normalize (resolve $ref and return concrete schema)
function deref(schema: Schema, defs: Record<string, unknown>): Schema {
  if (schema?.$ref) return deref(resolveRef(schema.$ref, defs), defs);
  return schema;
}

// Build a descriptor recursively from a (resolved) schema
function buildFromSchema(
  name: string,
  schema: Schema,
  defs: Record<string, unknown>,
  argForSemantics?: { schema?: any }
): ParamDescriptor {
  // Support schema-level oneOf: produce a "virtual" choice descriptor
  if (schema?.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const choices = schema.oneOf.map((s: any, i: number) =>
      buildFromSchema(`${name} (option ${i + 1})`, deref(s, defs), defs, argForSemantics),
    );
    return {
      name,
      type: "unknown",
      oneOfChoices: choices,
      validate: () => null,
      coerce: (x) => x,
    } as ParamDescriptor;
  }

  const t = classifyDataType(schema);
  const title = schema?.title as string | undefined;
  const description = schema?.description as string | undefined;

  // Base descriptor
  const base: ParamDescriptorBase = {
    name,
    type: t,
    title,
    description,
    validate: () => null,
    coerce: (x) => x,
  };

  // Attach semantics & byte bounds if PolicyId / AssetName
  const sem = detectSemantics(argForSemantics ?? {}, schema);
  Object.assign(base, sem);

  // Primitive: bytes
  if (t === "bytes" || (t === "builtin" && schema?.dataType === "#bytes")) {
    // CIP-57 bytes keywords: minLength/maxLength measured in bytes
    const minBytes = base.minBytes ?? schema?.minLength;
    const maxBytes = base.maxBytes ?? schema?.maxLength;
    if (typeof minBytes === "number") base.minBytes = minBytes;
    if (typeof maxBytes === "number") base.maxBytes = maxBytes;

    base.validate = (raw) => {
      // Accept either hex (with/without 0x) or UTF-8 text that we'll encode to hex on coerce.
      const looksHex = isHex(raw);
      const hex = looksHex ? hexEven(raw) : encodeUtf8ToHex(raw);
      if (!isHex(hex)) return "Invalid hex";
      if (hex.length % 2 !== 0) return "Hex length must be even";
      const byteLen = hexToByteLen(hex);
      if (base.minBytes !== undefined && byteLen < base.minBytes)
        return `Too short: need ≥ ${base.minBytes} bytes`;
      if (base.maxBytes !== undefined && byteLen > base.maxBytes)
        return `Too long: max ${base.maxBytes} bytes`;
      return null;
    };
    base.coerce = (raw) => {
      if (isHex(raw)) return raw.replace(/^0x/, "").toLowerCase();
      return encodeUtf8ToHex(raw).toLowerCase();
    };

    return base as ParamDescriptor;
  }

  // Primitive: integer (BigInt)
  if (t === "integer" || (t === "builtin" && schema?.dataType === "#integer")) {
    if (schema?.minimum !== undefined) base.minimum = BigInt(schema.minimum);
    if (schema?.maximum !== undefined) base.maximum = BigInt(schema.maximum);
    if (schema?.exclusiveMaximum !== undefined) base.exclusiveMaximum = BigInt(schema.exclusiveMaximum);
    if (schema?.multipleOf !== undefined) base.multipleOf = BigInt(schema.multipleOf);

    base.validate = (raw) => {
      if (!/^-?\d+$/.test(raw)) return "Expected an integer";
      try {
        const v = BigInt(raw);
        if (base.minimum !== undefined && v < base.minimum) return `Must be ≥ ${base.minimum}`;
        if (base.maximum !== undefined && v > base.maximum) return `Must be ≤ ${base.maximum}`;
        if (base.exclusiveMaximum !== undefined && v >= base.exclusiveMaximum)
          return `Must be < ${base.exclusiveMaximum}`;
        if (base.multipleOf !== undefined && v % base.multipleOf !== 0n)
          return `Must be a multiple of ${base.multipleOf}`;
      } catch {
        return "Integer out of range";
      }
      return null;
    };
    base.coerce = (raw) => BigInt(raw);
    return base as ParamDescriptor;
  }

  // Container: list
  if (t === "list" || (t === "builtin" && schema?.dataType === "#list")) {
    const desc: ParamDescriptorList = { ...(base as any), type: "list" };
    if (Array.isArray(schema?.items)) {
      // Tuple/product
      desc.items = schema.items.map((s: any, i: number) =>
        buildFromSchema(`${name}[${i}]`, deref(s, defs), defs, argForSemantics),
      );
    } else if (schema?.items) {
      // Homogeneous
      desc.items = buildFromSchema(`${name}[]`, deref(schema.items, defs), defs, argForSemantics);
    }
    if (typeof schema?.maxItems === "number") desc.maxItems = schema.maxItems;
    return desc;
  }

  // Container: map
  if (t === "map") {
    const desc: ParamDescriptorMap = { ...(base as any), type: "map" };
    if (schema?.keys) {
      desc.keys = buildFromSchema(`${name}{key}`, deref(schema.keys, defs), defs, argForSemantics);
    }
    if (schema?.values) {
      desc.values = buildFromSchema(`${name}{value}`, deref(schema.values, defs), defs, argForSemantics);
    }
    if (typeof schema?.maxItems === "number") desc.maxItems = schema.maxItems;
    return desc;
  }

  // Container: constructor
  if (t === "constructor") {
    const desc: ParamDescriptorConstructor = { ...(base as any), type: "constructor" };
    if (Array.isArray(schema?.fields)) {
      desc.fields = schema.fields.map((s: any, i: number) =>
        buildFromSchema(`${name}.field${i}`, deref(s, defs), defs, argForSemantics),
      );
    }
    return desc;
  }

  // Builtins like '#string' / '#boolean' (discouraged, but some blueprints may use them)
  if (t === "builtin") {
    const dt = schema?.dataType as string;
    if (dt === "#string") {
      base.validate = () => null;
      base.coerce = (raw) => raw;
    } else if (dt === "#boolean") {
      base.validate = (raw) => (/^(true|false)$/i.test(raw) ? null : "Expected true/false");
      base.coerce = (raw) => /^true$/i.test(raw);
    }
    return base as ParamDescriptor;
  }

  // Unknown fallback
  return base as ParamDescriptor;
}

// Flatten 'oneOf' at the argument level (validator.parameters[].oneOf of args)
function flattenArg(arg?: Cip57Arg | { oneOf: Cip57Arg[] }) {
  if (!arg) return [];
  return "oneOf" in (arg as any) ? ((arg as any).oneOf as Cip57Arg[]) : [arg as Cip57Arg];
}

// ---------- main ----------

export function buildParamDescriptors(
  validator: { parameters?: (Cip57Arg | { oneOf: Cip57Arg[] })[] },
  definitions: Record<string, unknown> = {}
): ParamDescriptor[] {
  if (!validator?.parameters?.length) return [];

  const out: ParamDescriptor[] = [];

  for (const paramChoice of validator.parameters) {
    const candidates = flattenArg(paramChoice);
    const first = candidates[0]; // simple heuristic: pick first if multiple arg-choices
    const name = (first as any)?.title || "param";
    let schema: any = (first as any)?.schema;

    // Deref $ref at top-level schema (schema may itself contain oneOf)
    schema = deref(schema, definitions);

    // Build descriptor (handles schema.oneOf internally)
    const desc = buildFromSchema(name, schema, definitions, first);

    // Backstop: re-apply semantics rules even if schema didn’t carry them (title on arg)
    const sem = detectSemantics(first ?? {}, schema);
    Object.assign(desc, sem);

    out.push(desc);
  }

  return out;
}