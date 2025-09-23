import { describe, it, expect } from "vitest";
import { AikenPlutusJsonSchema } from "~/lib/AikenPlutusJsonSchema";
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
import { readJsonFixture, readTextFixture } from "./_helpers";

// Good blueprints
const validJson = ["dedog.blueprint.json", "asteria.blueprint.json"] as const;

// All negative JSON cases (invalid by schema/rules)
const invalidJson = [
  "missing-preamble.json",
  "missing-preamble-title.json",
  "missing-preamble-plutusVersion.json",
  "missing-compiler-version.json",
  "empty-validators.json",
  "non-else-missing-compiledCode.json",
  "else-missing-both.json",
  "bad-compiledCode-not-hex.json",
  "bad-compiledCode-odd-length.json",
  "bad-compiledCode-wrong-cbor-prefix.json",
  "bad-hash-length.json",
  "bad-hash-non-hex.json",
] as const;

describe("Valid blueprints", () => {
  it.each(validJson)("accepts %s (schema + API)", (filename) => {
    const obj = readJsonFixture(filename);

    // Schema-level
    const s = AikenPlutusJsonSchema.safeParse(obj);
    if (!s.success) console.log(`schema issues (${filename}):`, s.error.issues);
    expect(s.success).toBe(true);

    // API-level
    const v = validateAikenBlueprint(obj);
    if (!v.ok) console.log(`api issues (${filename}):`, v.errors);
    expect(v.ok).toBe(true);
  });
});

describe("Invalid blueprints (JSON)", () => {
  it.each(invalidJson)("rejects %s", (filename) => {
    const obj = readJsonFixture(filename);

    // Schema-level
    const s = AikenPlutusJsonSchema.safeParse(obj);
    expect(s.success).toBe(false);

    // API-level
    const v = validateAikenBlueprint(obj);
    expect(v.ok).toBe(false);
  });
});

describe("Text files", () => {
  it("accepts dedog.txt (valid JSON)", () => {
    const txt = readTextFixture("dedog.txt");
    const v = validateAikenBlueprint(txt);
    expect(v.ok).toBe(true);
  });

  it("rejects fail.txt (invalid JSON)", () => {
    const txt = readTextFixture("fail.txt");
    const v = validateAikenBlueprint(txt);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors[0]?.code).toBe("JSON_PARSE");
  });
});