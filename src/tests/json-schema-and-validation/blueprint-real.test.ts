import { describe, it, expect } from "vitest";
import { AikenPlutusJsonSchema } from "~/lib/AikenPlutusJsonSchema";
// ⬇️ Make sure this path matches your actual file name
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";

import { readJsonFixture, readTextFixture } from "./_helpers";

// Parameterized list of known-good JSON blueprints
const jsonBlueprints = [
  "dedog.blueprint.json",
  "asteria.blueprint.json",
] as const;

describe("Real blueprints (baseline)", () => {
  // One test per JSON blueprint (shows individually in reporter)
  it.each(jsonBlueprints)("accepts %s (schema + API)", (filename) => {
    const data = readJsonFixture(filename);

    // Schema-level (unit)
    const s = AikenPlutusJsonSchema.safeParse(data);
    if (!s.success) {
      // print once, but don't spam
      console.log(`schema issues (${filename}):`, s.error.issues);
    }
    expect(s.success).toBe(true);

    // API-level (integration of your wrapper incl. path formatting)
    const v = validateAikenBlueprint(data);
    if (!v.ok) {
      console.log(`api issues (${filename}):`, v.errors);
    }
    expect(v.ok).toBe(true);
  });

  // Raw .txt -> invalid JSON should be rejected by the API wrapper
  it("rejects invalid JSON text (fail.txt)", () => {
    const txt = readTextFixture("fail.txt"); // deliberately invalid JSON
    const res = validateAikenBlueprint(txt);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]?.code).toBe("JSON_PARSE");
    }
  });

  // Raw .txt that contains valid JSON should be accepted by the API wrapper
  it("accepts valid JSON text (dedog.txt)", () => {
    const txt = readTextFixture("dedog.txt"); // same JSON as dedog.blueprint.json
    const res = validateAikenBlueprint(txt);
    if (!res.ok) {
      console.log("api issues (dedog.txt):", res.errors);
    }
    expect(res.ok).toBe(true);
  });
});