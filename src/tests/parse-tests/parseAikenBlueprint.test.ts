// tests/parse-tests/parseAikenBlueprint.test.ts
//
// PURPOSE
// -------
// This suite focuses on the two PARSE APIs, independent from the schema/validation tests:
// - parseAikenBlueprintStrict(validated): consumes a *validated* AikenBlueprint and returns ParsedJson.
// - parseAikenBlueprint(input): validates first (via validateAikenBlueprint) and then parses.
//
// What we verify here:
// 1) Happy paths on real fixtures: structure shape, grouping by base, purposes present, .else skipping.
// 2) Invariants independent of fixture details: order independence, "first seen wins" for shared fields,
//    and that only recognized purposes are emitted.
// 3) Convenience API behavior parity with Strict, and failure passthrough on invalid input.
// 4) A couple of summarizer spot checks so we know datum/redeemer schemas are summarized as intended.
//
// Notes on failure readability:
// - We thread context strings into expect() calls, e.g., `file=${filename}` or `ctx=...`.
// - Use toStrictEqual for canonical equality where missing/undefined distinctions matter.
// - When debugging, you can also run single tests: `vitest run -t "parses dedog.blueprint.json"`
//

import { describe, it, expect } from "vitest";
import { assertOk, readJsonFixture, readTextFixture } from "../_helpers";

import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
import {
  parseAikenBlueprintStrict,
  parseAikenBlueprint,
} from "~/lib/parse/parseAikenBlueprint";

// ------------------------------
// Fixture lists
// ------------------------------

// We reuse the same "good" JSON blueprints used in the schema/validation suite.
// These should already be known-good at the API level (validateAikenBlueprint -> ok).
const validJson = ["dedog.blueprint.json", "asteria.blueprint.json"] as const;

// ------------------------------
// Small helpers for in-memory blueprints
// ------------------------------

function sInteger(): SchemaNode {
  // Minimal inline "data layer" schema – enough to exercise summarizeSchema("integer")
  return { dataType: "integer" } as any;
}
function sBytes(): SchemaNode {
  return { dataType: "bytes" } as any;
}

// Shorthand to sort object keys for stable comparisons
function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

describe("parseAikenBlueprintStrict (parses already-validated AikenBlueprint)", () => {
  // WHY:
  // - With real fixtures, we want to assert invariant properties of the output shape.
  // - We avoid over-coupling to exact internals of fixtures: only structural assertions.
  // HOW:
  // - Validate each fixture to produce a canonical AikenBlueprint.
  // - Parse with Strict and check core invariants (grouping, purpose keys, .else skipping).
  it.each(validJson)("parses %s (structure + invariants)", (filename) => {
    const obj = readJsonFixture(filename);

    const v = validateAikenBlueprint<AikenBlueprint>(obj);
    if (!v.ok) console.log(`unexpected validation errors for ${filename}:`, v.errors);
    expect(v.ok, `file=${filename}`).toBe(true);
    assertOk(v);
    const parsed = parseAikenBlueprintStrict(v.data);

    // Top-level invariants
    expect(typeof parsed.plutusVersion, `file=${filename} | plutusVersion should be a string`).toBe(
      "string"
    );
    expect(
      parsed.validators && typeof parsed.validators,
      `file=${filename} | validators should be an object`
    ).toBe("object");

    // Per-validator invariants independent of fixture details:
    for (const [base, val] of Object.entries(parsed.validators)) {
      // 1) The key should be the *base* (i.e., title without a trailing purpose).
      //    If a purpose suffix leaked into 'base', this will catch it.
      const hasSuffix =
        base.endsWith(".spend") ||
        base.endsWith(".mint") ||
        base.endsWith(".withdraw") ||
        base.endsWith(".publish") ||
        base.endsWith(".vote") ||
        base.endsWith(".propose");
      expect(hasSuffix, `file=${filename} | base must not contain purpose suffix: base="${base}"`).toBe(
        false
      );

      // 2) The value's name mirrors the key.
      expect(val.name, `file=${filename} | name should mirror base`).toBe(base);

      // 3) Only recognized purposes should appear (and only if present in source).
      const allowed = new Set(["spend", "mint", "withdraw", "publish", "vote", "propose"]);
      for (const k of Object.keys(val.purposes)) {
        expect(
          allowed.has(k),
          `file=${filename} | unexpected purpose key: ${k} on base=${base}`
        ).toBe(true);
      }

      // 4) `.else` (and unknown suffixes) are never present as emitted purposes.
      expect((val.purposes as any).else, `file=${filename} | '.else' must not appear`).toBeUndefined();
    }
  });

  // WHY:
  // - Verify "first seen wins" for shared fields (parameters, compiledCode, hash) across the same base.
  // - Verify that entries with unknown suffix OR `.else` are skipped entirely.
  // - Verify summarizer hints for a few schema nodes (sanity).
  // HOW:
  // - Build a tiny in-memory AikenBlueprint with multiple entries sharing a base.
  it("groups multiple purposes by base and enforces 'first seen wins' for shared fields", () => {
    const compiledA = "4e4d0100003322"; // stub CBOR-like hex (shape only; real guard is in validation)
    const compiledB = "4e4d0100009999";

    const bp: AikenBlueprint = {
      preamble: {
        title: "demo/project",
        description: "test",
        version: "0.0.0",
        plutusVersion: "v3",
        compiler: { name: "Aiken", version: "v1.2.3" },
        license: "Apache-2.0",
      },
      validators: [
        {
          title: "pkg.mod.myValidator.spend", // FIRST occurrence of this base
          parameters: [{ title: "p1", schema: sInteger() }],
          datum: { title: "d", schema: sBytes() },
          redeemer: { title: "r", schema: sInteger() },
          compiledCode: compiledA,
          hash: "a".repeat(56),
        },
        {
          title: "pkg.mod.myValidator.mint", // SAME base, different shared fields (should NOT override)
          parameters: [{ title: "p1", schema: sBytes() }], // different type than first
          redeemer: { title: "r", schema: sBytes() },
          compiledCode: compiledB, // ignored
          hash: "b".repeat(56), // ignored
        },
        {
          title: "pkg.mod.myValidator.foo" as any, // unknown suffix → skipped
          compiledCode: compiledB,
          hash: "c".repeat(56),
        },
        {
          title: "pkg.mod.myValidator.else", // ".else" → skipped entirely
          compiledCode: compiledB,
          hash: "d".repeat(56),
        } as any,
      ],
    };

    const parsed = parseAikenBlueprintStrict(bp);
    expect(parsed.plutusVersion, "ctx=first-wins | wrong plutusVersion").toBe("v3");

    const v = parsed.validators["pkg.mod.myValidator"];
    expect(v, "ctx=first-wins | missing grouped validator at base 'pkg.mod.myValidator'").toBeDefined();

    // Shared fields must come from the FIRST encountered entry for the base.
    expect(v!.compiledCode, "ctx=first-wins | compiledCode should come from first entry").toBe(
      compiledA
    );
    expect(v!.hash, "ctx=first-wins | hash should come from first entry").toBe("a".repeat(56));

    // Parameters should be taken from FIRST entry only.
    expect(v!.parameters.length, "ctx=first-wins | parameters length").toBe(1);
    expect(v!.parameters[0]?.name, "ctx=first-wins | parameter name mismatch").toBe("p1");
    expect(
      v!.parameters[0]?.schema.typeHint,
      "ctx=first-wins | parameter typeHint must reflect the first entry"
    ).toBe("integer");

    // Recognized purposes present, unknown ones skipped
    expect(v!.purposes.spend, "ctx=first-wins | spend purpose missing").toBeDefined();
    expect(v!.purposes.mint, "ctx=first-wins | mint purpose missing").toBeDefined();
    expect((v!.purposes as any).foo, "ctx=first-wins | unknown purpose should be skipped").toBeUndefined();
    expect((v!.purposes as any).else, "ctx=first-wins | '.else' must be skipped").toBeUndefined();

    // Summarizer spot checks (sanity)
    expect(
      v!.purposes.spend?.datum?.schema.typeHint,
      "ctx=first-wins | spend.datum summarizer"
    ).toBe("bytes");
    expect(
      v!.purposes.spend?.redeemer?.schema.typeHint,
      "ctx=first-wins | spend.redeemer summarizer"
    ).toBe("integer");
    expect(
      v!.purposes.mint?.redeemer?.schema.typeHint,
      "ctx=first-wins | mint.redeemer summarizer"
    ).toBe("bytes");
  });

  // WHY:
  // - The parse result should be independent of the input order of validators.
  // HOW:
  // - Build two AikenBlueprints with the same entries but different permutations and compare purpose keys.
  it("is order-independent (same base regardless of input order)", () => {
    const mk = (order: Array<"spend" | "mint" | "withdraw">): AikenBlueprint => ({
      preamble: {
        title: "demo/order",
        description: "",
        version: "0.0.0",
        plutusVersion: "v3",
        compiler: { name: "Aiken", version: "v1.0.0" },
        license: "Apache-2.0",
      },
      validators: order.map((p, i) => ({
        title: `x.y.z.${p}`,
        parameters: i === 0 ? [{ title: "seed", schema: sInteger() }] : undefined,
        compiledCode: "4e4d0100001122",
        hash: "f".repeat(56),
        redeemer: { title: "r", schema: sInteger() },
      })),
    });

    const a = parseAikenBlueprintStrict(mk(["spend", "mint", "withdraw"]));
    const b = parseAikenBlueprintStrict(mk(["withdraw", "mint", "spend"]));

    const va = a.validators["x.y.z"];
    const vb = b.validators["x.y.z"];
    expect(va, "ctx=order-indep | missing validator for base 'x.y.z' in A").toBeDefined();
    expect(vb, "ctx=order-indep | missing validator for base 'x.y.z' in B").toBeDefined();

    expect(
      sortedKeys(va!.purposes),
      "ctx=order-indep | purpose set must match regardless of input order"
    ).toEqual(sortedKeys(vb!.purposes));
  });
});

describe("parseAikenBlueprint (validates then parses)", () => {
  // WHY:
  // - The convenience API should produce the exact same structure as Strict when given the same logical input.
  // HOW:
  // - For each good fixture, compare parseAikenBlueprint(obj) to parseAikenBlueprintStrict(validated.data).
  it.each(validJson)("returns ParsedJson for %s (parity with strict)", (filename) => {
    const obj = readJsonFixture(filename);

    const v = validateAikenBlueprint<AikenBlueprint>(obj);
    expect(v.ok, `file=${filename} | validation unexpectedly failed`).toBe(true);
    assertOk(v);
    const strictOut = parseAikenBlueprintStrict(v.data);
    const convOut = parseAikenBlueprint(obj);
    // Sanity: convenience API returns a ParsedJson, not a failure
    expect((convOut as any).validators, `file=${filename} | convenience API not returning ParsedJson`).toBeDefined();

    // Parity: the structures should be identical.
    expect(convOut, `file=${filename} | convenience output diverged from strict`).toStrictEqual(
      strictOut
    );
  });

  // WHY:
  // - We support .txt inputs via the validator; if it's accepted there, the convenience API should yield ParsedJson.
  // HOW:
  // - Feed the .txt, check that a ParsedJson comes back (not a failure).
  it("accepts dedog.txt via validator, then parses", () => {
    const txt = readTextFixture("dedog.txt");
    const res = parseAikenBlueprint(txt);

    // If your validator accepts .txt (as your schema tests imply), this should be a ParsedJson:
    expect((res as any).validators, "ctx=txt-accept | expected ParsedJson from .txt").toBeDefined();
    expect(typeof (res as any).plutusVersion, "ctx=txt-accept | missing plutusVersion").toBe("string");
  });

  // WHY:
  // - The convenience API should return the *validator failure object* on invalid input, not throw.
  // HOW:
  // - Feed obviously invalid input and assert ok===false.
  it("returns BlueprintValidationFailure for invalid input", () => {
    const res = parseAikenBlueprint({}); // obviously invalid shape
    expect(
      (res as any).ok,
      "ctx=invalid-input | expected a validation failure object with ok=false"
    ).toBe(false);
  });
});

// ---------------------------------------------
// Debug logging for ALL valid + some invalid files
// Toggle with: LOG_PARSE=1 or LOG_PARSE_FULL=1
// ---------------------------------------------

// NOTE: Run [ LOG_PARSE=1 npx vitest run tests/parse-tests/parseAikenBlueprint.test.ts -t "Debug:" ] for summary.
// NOTE: Run [ LOG_PARSE=1 LOG_PARSE_FULL=1 npx vitest run tests/parse-tests/parseAikenBlueprint.test.ts -t "Debug:" ] for full output.

// All valid files: both JSON and TXT
const validFiles = [
  { name: "asteria.blueprint.json", type: "json" },
  { name: "dedog.blueprint.json", type: "json" },
  { name: "dedog.txt", type: "txt" },
] as const;

// Subset of invalid files (JSON + TXT) for logs
const invalidFiles = [
  { name: "missing-preamble.json", type: "json" },
  { name: "empty-validators.json", type: "json" },
  { name: "fail.txt", type: "txt" },
] as const;

function logParseOutcome(label: string, res: unknown) {
  if (process.env.LOG_PARSE !== "1") return; // only log when explicitly enabled
  const full = process.env.LOG_PARSE_FULL === "1";

  if ((res as any)?.ok === false) {
    console.log(`\n[${label}] VALIDATION FAILURE`);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const parsed = res as any;
  const validatorNames = Object.keys(parsed?.validators ?? {});
  const summary = {
    plutusVersion: parsed?.plutusVersion,
    validatorCount: validatorNames.length,
    validators: validatorNames.slice(0, 10),
  };

  console.log(`\n[${label}] PARSED SUMMARY`);
  console.log(JSON.stringify(summary, null, 2));

  if (full) {
    console.log(`\n[${label}] PARSED FULL`);
    console.log(JSON.stringify(parsed, null, 2));
  }
}

describe("Debug: log parseAikenBlueprint outputs (toggle with LOG_PARSE=1)", () => {
  it.each(validFiles)("valid file → logs %s", ({ name, type }) => {
    const input = type === "json" ? readJsonFixture(name) : readTextFixture(name);
    const res = parseAikenBlueprint(input);
    logParseOutcome(`valid:${name}`, res);
    expect((res as any).validators, `expected ParsedJson for ${name}`).toBeDefined();
  });

  it.each(invalidFiles)("invalid file → logs %s", ({ name, type }) => {
    const input = type === "json" ? readJsonFixture(name) : readTextFixture(name);
    const res = parseAikenBlueprint(input);
    logParseOutcome(`invalid:${name}`, res);
    expect((res as any).ok, `expected failure for ${name}`).toBe(false);
  });
});