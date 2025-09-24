import fs from "node:fs";
import path from "node:path";
import type { BlueprintValidationFailure, BlueprintValidationSuccess } from "~/lib/validatePlutusJson";

export function readJsonFixture<T = any>(filename: string): T {
  const p = path.resolve(process.cwd(), "fixtures", filename);
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s);
}

export function readTextFixture(filename: string): string {
  const p = path.resolve(process.cwd(), "fixtures", filename);
  return fs.readFileSync(p, "utf8");
}

export function assertOk<T>(
  res: BlueprintValidationFailure | BlueprintValidationSuccess<T>
): asserts res is BlueprintValidationSuccess<T> {
  if (!res.ok) {
    // Throw so Vitest fails clearly and prints validation errors
    throw new Error(
      `validateAikenBlueprint failed: ${JSON.stringify(res.errors, null, 2)}`
    );
  }
}