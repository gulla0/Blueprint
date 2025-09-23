import type { ZodIssue } from "zod";
import { AikenPlutusJsonSchema } from "~/lib/AikenPlutusJsonSchema"; // <-- import your schema
import type { AikenBlueprint } from "~/lib/AikenPlutusJsonSchema";

export type BlueprintValidationSuccess<T = unknown> = {
  ok: true;
  data: T;
};

export type BlueprintValidationFailure = {
  ok: false;
  errors: Array<{ path: string; message: string; code: string }>;
  issues: ZodIssue[]; // raw zod issues if you need them
};

/** Validate aiken-style plutus.json (accepts parsed object or JSON string). */
export function validateAikenBlueprint<T = unknown>(
  input: unknown
): BlueprintValidationSuccess<T> | BlueprintValidationFailure {
  let json: any = input;

  // If a string is passed, try to parse it
  if (typeof input === "string") {
    try {
      json = JSON.parse(input);
    } catch (e: any) {
      return {
        ok: false,
        errors: [{ path: "", message: `Invalid JSON: ${e.message}`, code: "JSON_PARSE" }],
        issues: [],
      };
    }
  }

  const result = AikenPlutusJsonSchema.safeParse(json);

  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => ({
        path: formatPathUsingTitles(i.path, json),
        message: i.message,
        code: i.code,
      })),
      issues: result.error.issues,
    };
  }

  // ==== NEW: Equality Guards ====
  const equalityErrors = equalityGuards(result.data as AikenBlueprint, json);
  if (equalityErrors.length > 0) {
    return {
      ok: false,
      errors: equalityErrors,
      issues: [],
    };
  }

  return { ok: true, data: result.data as T };
}

/** Replace validators[index] with the validator's title for clearer error paths. */
function formatPathUsingTitles(pathArr: (string | number)[], root: any): string {
  if (!pathArr.length) return "";
  const parts: string[] = [];

  for (let i = 0; i < pathArr.length; i++) {
    const seg = pathArr[i];

    if (typeof seg === "number" && i > 0 && pathArr[i - 1] === "validators") {
      const title = root?.validators?.[seg]?.title;
      parts.push(title || `validators[${seg}]`);
    } else {
      parts.push(String(seg));
    }
  }

  return parts.join(".");
}

/* ============================================================
 * Equality guards: enforce same compiledCode/hash/parameters
 * across purposes for each base validator
 * ========================================================== */

const PURPOSES = new Set(["spend", "mint", "withdraw", "publish", "vote", "propose"]);

function splitBaseAndPurpose(title: string): { base: string; purpose?: string; isElse: boolean } {
  const parts = title.trim().split(".");
  const last = parts[parts.length - 1] ?? "";
  if (last === "else") return { base: parts.slice(0, -1).join("."), purpose: undefined, isElse: true };
  if (PURPOSES.has(last)) return { base: parts.slice(0, -1).join("."), purpose: last, isElse: false };
  return { base: title.trim(), purpose: undefined, isElse: false };
}

function stableParamKey(p: { title: string; schema: unknown }): string {
  return JSON.stringify(sortKeysDeep({ name: p.title, schema: p.schema }));
}

function sameParamSets(a?: any[], b?: any[]): boolean {
  const A = Array.isArray(a) ? a.map(stableParamKey).sort() : [];
  const B = Array.isArray(b) ? b.map(stableParamKey).sort() : [];
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
  return true;
}

function equalityGuards(ast: AikenBlueprint, rawForPaths: any) {
  const errors: Array<{ path: string; message: string; code: string }> = [];
  const groups = new Map<string, { first: number; items: Array<{ idx: number; v: any }> }>();

  // Group by base (skip .else and non-purpose)
  ast.validators.forEach((v, idx) => {
    const { base, purpose, isElse } = splitBaseAndPurpose(v.title);
    if (isElse || !purpose) return;
    const g = groups.get(base) ?? { first: idx, items: [] };
    g.items.push({ idx, v });
    groups.set(base, g);
  });

  // Enforce equality within each base
  for (const [base, { items }] of groups) {
    if (items.length <= 1) continue;

    // Destructure safely for strict indexing
    const [firstItem, ...rest] = items;
    if (!firstItem) continue;
    const ref = firstItem.v;

    for (const { idx, v } of rest) {
      if (ref.compiledCode !== v.compiledCode) {
        errors.push({
          path: formatPathUsingTitles(["validators", idx, "compiledCode"], rawForPaths),
          message: `compiledCode must be identical across purposes for "${base}"`,
          code: "EQUALITY_GUARD",
        });
      }

      if (ref.hash !== v.hash) {
        errors.push({
          path: formatPathUsingTitles(["validators", idx, "hash"], rawForPaths),
          message: `hash must be identical across purposes for "${base}"`,
          code: "EQUALITY_GUARD",
        });
      }

      if (!sameParamSets(ref.parameters, v.parameters)) {
        errors.push({
          path: formatPathUsingTitles(["validators", idx, "parameters"], rawForPaths),
          message: `parameters must be identical across purposes for "${base}"`,
          code: "EQUALITY_GUARD",
        });
      }
    }
  }

  return errors;
}

function sortKeysDeep(x: any): any {
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (x && typeof x === "object") {
    return Object.keys(x)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = sortKeysDeep(x[k]);
        return acc;
      }, {});
  }
  return x;
}