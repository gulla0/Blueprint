import {
    AikenPlutusJsonSchema,
    type AikenBlueprint,
    type SchemaNode,
    type ParameterNode,
  } from "~/lib/AikenPlutusJsonSchema";

import {
    validateAikenBlueprint,
    type BlueprintValidationFailure,
  } from "~/lib/validatePlutusJson";  

import type {
    ParsedJson,
    ParsedValidator,
    ParsedPurpose,
    PurposeName,
    SchemaSummary,
  } from "./types";
  
  /* -----------------------------------------------------------
   * 0) Purpose helpers
   * --------------------------------------------------------- */
  const PURPOSES = new Set<PurposeName>([
    "spend",
    "mint",
    "withdraw",
    "publish",
    "vote",
    "propose",
  ]);
  
  function splitBaseAndPurpose(title: string): {
    base: string;
    purpose?: PurposeName;
    isElse: boolean;
  } {
    const parts = title.trim().split(".");
    const last = parts[parts.length - 1] ?? "";
    if (last === "else") return { base: parts.slice(0, -1).join("."), purpose: undefined, isElse: true };
    const maybe = last as PurposeName;
    if (PURPOSES.has(maybe)) {
      return { base: parts.slice(0, -1).join("."), purpose: maybe, isElse: false };
    }
    // No recognized suffix → treat the entire title as base (no purpose)
    return { base: title.trim(), purpose: undefined, isElse: false };
  }
  
  /* -----------------------------------------------------------
   * 1) Schema summarizer (precise node preserved)
   *    - Returns a human-friendly "typeHint" AND the exact node
   * --------------------------------------------------------- */
  function summarizeSchema(node: SchemaNode | undefined): SchemaSummary {
    if (!node) return { typeHint: "none", raw: {} as SchemaNode };
  
    // $ref
    if (typeof (node as any)?.$ref === "string") {
      return { typeHint: `ref:${(node as any).$ref}`, raw: node };
    }
  
    // {} (opaque)
    if (typeof node === "object" && node && Object.keys(node).length === 0) {
      return { typeHint: "opaque{}", raw: node };
    }
  
    // From here on, it's an inline schema (hash-prefixed OR data layer)
    const n: any = node;
  
    // Hash-prefixed layer
    if (typeof n.dataType === "string" && n.dataType.startsWith("#")) {
      const dt = n.dataType as string;
  
      if (dt === "#list") {
        // items can be one schema or array of alternatives
        const items = n.items;
        if (Array.isArray(items)) {
          const opts = items.map((opt: any) => summarizeSchema(opt).typeHint);
          return { typeHint: `list<${opts.join(" | ")}>` , raw: node };
        }
        return { typeHint: `list<${summarizeSchema(items).typeHint}>`, raw: node };
      }
  
      if (dt === "#pair") {
        const L = summarizeSchema(n.left).typeHint;
        const R = summarizeSchema(n.right).typeHint;
        return { typeHint: `pair<${L}, ${R}>`, raw: node };
      }
  
      // #integer, #bytes, #string, #unit, #boolean
      return { typeHint: dt.slice(1), raw: node };
    }
  
    // Data layer (integer | bytes | list | map | anyOf constructors)
    if (n.dataType === "integer") return { typeHint: "integer", raw: node };
    if (n.dataType === "bytes")   return { typeHint: "bytes", raw: node };
  
    if (n.dataType === "list") {
      const it = summarizeSchema(n.items).typeHint;
      return { typeHint: `list<${it}>`, raw: node };
    }
  
    if (n.dataType === "map") {
      const K = summarizeSchema(n.keys).typeHint;
      const V = summarizeSchema(n.values).typeHint;
      return { typeHint: `map<${K}, ${V}>`, raw: node };
    }
  
    if (Array.isArray(n.anyOf)) {
      const alts = n.anyOf.map((c: any) => {
        const idx = typeof c?.index === "number" ? c.index : "?";
        const fields = Array.isArray(c?.fields) ? c.fields.map((f: any) => summarizeSchema(f).typeHint) : [];
        return `C${idx}(${fields.join(", ")})`;
      });
      return { typeHint: `constructor[${alts.join(" | ")}]`, raw: node };
    }
  
    // Fallback (should be rare with your schema)
    return { typeHint: "unknown", raw: node };
  }
  
  /* -----------------------------------------------------------
   * 2) Extract parameters (shared at validator level)
   * --------------------------------------------------------- */
  function extractParameters(params?: ParameterNode[]): { name: string; schema: SchemaSummary }[] {
    if (!Array.isArray(params)) return [];
    return params.map((p) => ({
      name: p.title,
      schema: summarizeSchema(p.schema),
    }));
  }
  
  /* -----------------------------------------------------------
   * 3) Build (or fetch) a ParsedValidator shell for a base name
   *    - Sets shared parameters/CBOR/hash once (first seen wins)
   * --------------------------------------------------------- */
  function getOrInitParsedValidator(
    out: ParsedJson,
    base: string,
    from: AikenBlueprint["validators"][number]
  ): ParsedValidator {
    const existing = out.validators[base];
    if (existing) return existing;
  
    const init: ParsedValidator = {
      name: base,
      parameters: extractParameters(from.parameters),
      compiledCode: from.compiledCode, // shared
      hash: from.hash,                 // shared
      purposes: {},
    };
    out.validators[base] = init;
    return init;
  }
  
  /* -----------------------------------------------------------
   * 4) Add a purpose entry (datum/redeemer only)
   * --------------------------------------------------------- */
  function addPurposeEntry(
    target: ParsedValidator,
    purpose: PurposeName,
    src: AikenBlueprint["validators"][number]
  ) {
    const entry: ParsedPurpose = {};
  
    if (src.datum)    entry.datum    = { schema: summarizeSchema(src.datum.schema) };
    if (src.redeemer) entry.redeemer = { schema: summarizeSchema(src.redeemer.schema) };
  
    target.purposes[purpose] = entry;
  
    // If compiledCode/hash/parameters differ across purposes (shouldn't), we keep the FIRST.
    // You can add strict checks here if you want to enforce equality.
  }
  
  /* -----------------------------------------------------------
   * 5) Public API — strict: assumes input already validated
   * --------------------------------------------------------- */
  export function parseAikenBlueprintStrict(validated: AikenBlueprint): ParsedJson {
    const out: ParsedJson = {
      plutusVersion: validated.preamble.plutusVersion,
      validators: {},
    };
  
    for (const v of validated.validators) {
      const { base, purpose, isElse } = splitBaseAndPurpose(v.title);
  
      // Skip ".else" entirely, and skip entries without a recognized purpose
      if (isElse || !purpose) continue;
  
      const pv = getOrInitParsedValidator(out, base, v);
  
      // If this is NOT the first time we see this base, we still only set params/CBOR/hash once.
      // (Optional) If you want to detect mismatches, compare here and throw/log.
  
      addPurposeEntry(pv, purpose, v);
    }
  
    return out;
  }
  
  /* -----------------------------------------------------------
   * 6) Convenience API — validates, then parses (throws on invalid)
   * --------------------------------------------------------- */
  export function parseAikenBlueprint(
    input: unknown
  ): ParsedJson | BlueprintValidationFailure {
    const res = validateAikenBlueprint<AikenBlueprint>(input);
    if (!res.ok) return res;              // bubble up your formatted errors
    return parseAikenBlueprintStrict(res.data);
  }