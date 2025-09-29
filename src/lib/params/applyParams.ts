// src/lib/params/applyParams.ts
import { applyParamsToScript } from "@meshsdk/core-csl";
import {
  resolvePlutusScriptAddress,
  resolveScriptHash,
  type PlutusScript,
} from "@meshsdk/core";

import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";
import { parseAikenBlueprint } from "~/lib/parse/parseAikenBlueprint";
import { validateParameterValue } from "~/lib/params/paramChecker";

/* =========================
   Public types
========================= */

type NetworkId = 0 | 1; // 0: test/preprod, 1: mainnet
export type Purpose = "mint" | "spend" | "withdraw" | "publish" | "vote" | "propose" | "unknown";

export type ApplyParamsResult = {
  scriptCbor: string;
  plutusScript: PlutusScript; // { code, version }
  scriptHash: string;         // policyId if mint; validator hash otherwise
  scriptAddress?: string;     // ONLY for 'spend'
  purpose: Purpose;
};

/* =========================
   Helpers
========================= */

function toMeshPlutusVersion(
  v?: AikenBlueprint["preamble"]["plutusVersion"]
): PlutusScript["version"] {
  return (v?.toUpperCase() as "V2" | "V3") ?? "V3";
}

function getValidatorByName(bp: any, name: string) {
  const vs = bp.validators ?? [];
  const v = vs.find((x: any) => x.title === name || x.name === name);
  if (!v) throw new Error(`Validator "${name}" not found.`);
  if (!v.compiledCode) throw new Error(`Validator "${name}" is missing compiledCode.`);
  return v;
}

export function inferPurposeFromTitle(title: string): Purpose {
  const m = /\[(\w+)\]\s*$/.exec(title);
  const k = m?.[1]?.toLowerCase();
  if (k === "mint" || k === "spend" || k === "withdraw" || k === "publish" || k === "vote" || k === "propose") {
    return k;
  }
  return "unknown";
}

/** light hinting for plain → CIP-57 wrapping */
function inferKind(s: SchemaNode): "int" | "bytes" | "other" {
  const t = (s as any).dataType as string | undefined;
  const title = (s as any).title as string | undefined;
  const ref = (s as any).$ref as string | undefined;
  const text = [t, title, ref].filter(Boolean).join("|").toLowerCase();
  if (text.includes("int")) return "int";
  if (text.includes("bytes") || text.includes("assetname") || text.includes("byte") || text.includes("hash")) return "bytes";
  return "other";
}

/** format one plain value → CIP-57 JSON (after validation) */
function toPlutusJson(value: unknown, schema: SchemaNode): unknown {
  if (
    value &&
    typeof value === "object" &&
    ("int" in (value as any) ||
      "bytes" in (value as any) ||
      "list" in (value as any) ||
      "map" in (value as any) ||
      "constructor" in (value as any))
  ) {
    return value;
  }

  const kind = inferKind(schema);

  if (kind === "int") {
    if (typeof value === "number" || typeof value === "bigint") return { int: value.toString() };
    if (typeof value === "string" && /^-?\d+$/.test(value)) return { int: value };
  }

  if (kind === "bytes" && typeof value === "string") {
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (/^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 === 0) return { bytes: hex.toLowerCase() };
  }

  // pass through for complex types the UI already collects as CIP-57
  return value;
}

/* =========================
   Main: parse-first, then (optional) apply
========================= */

/**
 * You pass the **raw uploaded JSON** here.
 * - We call your `parseAikenBlueprint` (which already validates + parses).
 * - If the validator has `parameters` AND you provide `userInputs`, we:
 *     validate each plain value → wrap to CIP-57 in declared order → bake with applyParamsToScript.
 * - Else we skip baking and just wrap the original compiledCode.
 *
 * NOTE:
 * - `scriptAddress` is returned **only** for `spend`.
 */
export function buildValidatorArtifactsFromRaw(
  rawBlueprint: unknown,
  validatorName: string,
  networkId: NetworkId,
  userInputs?: Record<string, unknown> | unknown[] | null
): ApplyParamsResult {
  const parsed = parseAikenBlueprint(rawBlueprint);
  if ((parsed as any).ok === false) {
    // Bubble up your validation error shape
    throw new Error(`Invalid Aiken blueprint: ${(parsed as any).message ?? "failed validation"}`);
  }
  return buildValidatorArtifactsFromParsed(parsed as any, validatorName, networkId, userInputs);
}

/**
 * If you already called `parseAikenBlueprint` yourself, use this.
 */
export function buildValidatorArtifactsFromParsed(
  bp: any, // ParsedJson from your parser
  validatorName: string,
  networkId: NetworkId,
  userInputs?: Record<string, unknown> | unknown[] | null
): ApplyParamsResult {
  const v = getValidatorByName(bp, validatorName);
  const schemas: SchemaNode[] = (v as any).parameters ?? (v as any).params ?? [];
  const purpose = inferPurposeFromTitle(v.title ?? v.name ?? validatorName);

  const hasParams = schemas.length > 0;
  const shouldApply = hasParams && userInputs != null;

  let scriptCbor: string;

  if (shouldApply) {
    // validate → format → push (in schema order)
    let paramsInOrder: object[];
    if (Array.isArray(userInputs)) {
      if (userInputs.length !== schemas.length) {
        throw new Error(`Expected ${schemas.length} params, received ${userInputs.length}.`);
      }
      paramsInOrder = userInputs.map((val, i) => {
        const r = validateParameterValue(schemas[i], val);
        if (!r.ok) throw new Error(`Param #${i + 1} invalid: ${r.message}`);
        return toPlutusJson(val, schemas[i]) as object;
      });
    } else {
      paramsInOrder = schemas.map((s, i) => {
        const key = (s as any).title ?? (s as any).name ?? `param_${i}`;
        if (!(key in userInputs!)) throw new Error(`Missing parameter "${key}".`);
        const raw = (userInputs as any)[key];
        const r = validateParameterValue(s, raw);
        if (!r.ok) throw new Error(`Parameter "${key}" invalid: ${r.message}`);
        return toPlutusJson(raw, s) as object;
      });
    }

    scriptCbor = applyParamsToScript(v.compiledCode, paramsInOrder, "JSON");
  } else {
    // paramless or already-baked uploaded script
    scriptCbor = v.compiledCode;
  }

  const plutusScript: PlutusScript = {
    code: scriptCbor,
    version: toMeshPlutusVersion(bp.preamble?.plutusVersion),
  };

  const scriptHash = resolveScriptHash(plutusScript.code);
  const scriptAddress =
    purpose === "spend" ? resolvePlutusScriptAddress(plutusScript, networkId) : undefined;

  return { scriptCbor, plutusScript, scriptHash, scriptAddress, purpose };
}