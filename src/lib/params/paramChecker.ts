// src/lib/params/paramChecker.ts
import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";

export type ParamCheckSuccess = { ok: true };
export type ParamCheckFailure = { ok: false; message: string };
export type ParamCheckResult = ParamCheckSuccess | ParamCheckFailure;

export type ParamCheckConfig = {
  unitAccepts?: "null" | "empty-object" | "both";
  mapAccepts?: "array-tuples" | "object" | "both";
};

const DEFAULT_CFG: Required<ParamCheckConfig> = {
  unitAccepts: "both",
  mapAccepts: "array-tuples",
};

export function validateParameterValue(
  schema: SchemaNode,
  value: unknown,
  definitions?: AikenBlueprint["definitions"],
  cfg: ParamCheckConfig = {}
): ParamCheckResult {
  const config = { ...DEFAULT_CFG, ...cfg };
  const r = checkNode(schema, value, definitions ?? {}, config);
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

/* ---------- same core helpers from earlier, trimmed to return just message ---------- */
type _R = { ok: true } | { ok: false; message: string };

function checkNode(
  node: SchemaNode,
  value: unknown,
  definitions: NonNullable<AikenBlueprint["definitions"]>,
  cfg: Required<ParamCheckConfig>
): _R {
  if (isRef(node)) {
    const resolved = resolveRef(node.$ref, definitions);
    if (!resolved) return fail(`Unresolved $ref: ${node.$ref}`);
    return checkNode(resolved as any, value, definitions, cfg);
  }
  if (isEmpty(node)) {
    return isPlutusData(value) ? ok() : fail("Expected valid Plutus Data");
  }
  return checkInline(node as any, value, definitions, cfg);
}

function checkInline(inline: any, value: unknown,
  definitions: NonNullable<AikenBlueprint["definitions"]>,
  cfg: Required<ParamCheckConfig>
): _R {
  const dt = inline?.dataType;

  // Hash-prefixed
  if (typeof dt === "string" && dt.startsWith("#")) {
    switch (dt) {
      case "#integer": return isInteger(value) ? ok() : fail("Expected integer");
      case "#bytes":   return isHex(value) ? ok() : fail("Expected hex string");
      case "#string":  return typeof value === "string" ? ok() : fail("Expected string");
      case "#boolean": return typeof value === "boolean" ? ok() : fail("Expected boolean");
      case "#unit": {
        if ((cfg.unitAccepts === "null" || cfg.unitAccepts === "both") && value === null) return ok();
        if ((cfg.unitAccepts === "empty-object" || cfg.unitAccepts === "both") && isEmptyObject(value)) return ok();
        return fail("Expected unit (null or {})");
      }
      case "#list": {
        if (!Array.isArray(value)) return fail("Expected array");
        const items = inline.items;
        if (Array.isArray(items)) {
          for (let i = 0; i < value.length; i++) {
            let matched = false;
            for (const alt of items) {
              const r = checkNode(unwrap(alt), value[i], definitions, cfg);
              if (r.ok) { matched = true; break; }
            }
            if (!matched) return fail(`Element ${i}: no list alternative matched`);
          }
          return ok();
        } else {
          for (let i = 0; i < value.length; i++) {
            const r = checkNode(unwrap(items), value[i], definitions, cfg);
            if (!r.ok) return fail(`Element ${i}: ${r.message}`);
          }
          return ok();
        }
      }
      case "#pair": {
        if (!Array.isArray(value) || value.length !== 2) return fail("Expected [left, right]");
        const rL = checkNode(unwrap(inline.left), value[0], definitions, cfg);
        if (!rL.ok) return fail(`left: ${rL.message}`);
        const rR = checkNode(unwrap(inline.right), value[1], definitions, cfg);
        if (!rR.ok) return fail(`right: ${rR.message}`);
        return ok();
      }
      default: return fail(`Unsupported dataType: ${dt}`);
    }
  }

  // Data-layer
  if (dt === "integer") return isInteger(value) ? ok() : fail("Expected integer");
  if (dt === "bytes")   return isHex(value) ? ok() : fail("Expected hex string");

  if (dt === "list") {
    if (!Array.isArray(value)) return fail("Expected array");
    const items = inline.items;
    if (Array.isArray(items)) {
      for (let i = 0; i < value.length; i++) {
        let matched = false;
        for (const alt of items) {
          const r = checkNode(unwrap(alt), value[i], definitions, cfg);
          if (r.ok) { matched = true; break; }
        }
        if (!matched) return fail(`Element ${i}: no list alternative matched`);
      }
      return ok();
    } else {
      for (let i = 0; i < value.length; i++) {
        const r = checkNode(unwrap(items), value[i], definitions, cfg);
        if (!r.ok) return fail(`Element ${i}: ${r.message}`);
      }
      return ok();
    }
  }

  if (dt === "map") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const pair = value[i];
        if (!Array.isArray(pair) || pair.length !== 2) return fail(`Entry ${i}: expected [key, value]`);
        const rK = checkNode(unwrap(inline.keys), pair[0], definitions, cfg);
        if (!rK.ok) return fail(`Entry ${i} key: ${rK.message}`);
        const rV = checkNode(unwrap(inline.values), pair[1], definitions, cfg);
        if (!rV.ok) return fail(`Entry ${i} value: ${rV.message}`);
      }
      return ok();
    }
    if ((cfg.mapAccepts === "object" || cfg.mapAccepts === "both") && isPlainObject(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const rk = checkNode(unwrap(inline.keys), k, definitions, cfg);
        if (!rk.ok) return fail(`Map key: ${rk.message}`);
        const rv = checkNode(unwrap(inline.values), v, definitions, cfg);
        if (!rv.ok) return fail(`Map value for key "${k}": ${rv.message}`);
      }
      return ok();
    }
    return fail("Expected map");
  }

  if (Array.isArray(inline?.anyOf)) {
    if (!isPlainObject(value) || typeof (value as any).constructor !== "number" || !Array.isArray((value as any).fields)) {
      return fail("Expected { constructor: number, fields: any[] }");
    }
    const ctor = (value as any).constructor as number;
    const fields = (value as any).fields as unknown[];
    const alt = inline.anyOf.find((c: any) => typeof c?.index === "number" && c.index === ctor);
    if (!alt) return fail(`No constructor with index ${ctor}`);
    const expected = Array.isArray(alt.fields) ? alt.fields : [];
    if (fields.length !== expected.length) return fail(`Constructor ${ctor} expected ${expected.length} field(s)`);
    for (let i = 0; i < fields.length; i++) {
      const r = checkNode(unwrap(expected[i]), fields[i], definitions, cfg);
      if (!r.ok) return fail(`Field ${i}: ${r.message}`);
    }
    return ok();
  }

  return fail("Unsupported schema node");
}

function isPlutusData(x: unknown): boolean {
    // Valid Plutus Data includes:
    //  - integer: number | bigint
    //  - bytes: hex string (even length)
    //  - list: array
    //  - map: array of [k,v] tuples or object (structure validated later)
    //  - constructor: { constructor: number, fields: any[] }
    if (isInteger(x)) return true;
    if (isHex(x)) return true;
    if (Array.isArray(x)) return true; // lists or maps-as-tuples
    if (isPlainObject(x)) {
      const o = x as any;
      if (typeof o.constructor === "number" && Array.isArray(o.fields)) return true; // constructor
      return true; // could be map-as-object
    }
    return false;
  }

/* ---------- tiny helpers ---------- */
const ok = (): _R => ({ ok: true });
const fail = (message: string): _R => ({ ok: false, message });

function isRef(x: any): x is { $ref: string } {
  return x && typeof x === "object" && typeof x.$ref === "string";
}
function isEmpty(x: any): x is {} {
  return x && typeof x === "object" && !("$ref" in x) && Object.keys(x).length === 0;
}
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && Object.getPrototypeOf(x) === Object.prototype;
}
function isEmptyObject(x: unknown) { return isPlainObject(x) && Object.keys(x).length === 0; }
function isInteger(x: unknown) { return typeof x === "bigint" || (typeof x === "number" && Number.isInteger(x)); }
function isHex(x: unknown) { return typeof x === "string" && /^[0-9a-fA-F]*$/.test(x) && x.length % 2 === 0; }

function resolveRef(ref: string, definitions: NonNullable<AikenBlueprint["definitions"]>) {
  const m = /^#\/definitions\/(.+)$/.exec(ref);
  const key = m?.[1];
  return key ? definitions[key] : undefined;
}

// Your Annotatable wrappers can be passed through as-is
function unwrap<T>(node: T): T { return node; }