// utils/validateAikenBlueprint.ts
import type { ZodIssue } from "zod";
import { AikenPlutusJsonSchema } from "~/lib/AikenPlutusJsonSchema"; // <-- import your schema

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
export function validateAikenBlueprint(
  input: unknown
): BlueprintValidationSuccess | BlueprintValidationFailure {
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

  if (result.success) {
    return { ok: true, data: result.data };
  }

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