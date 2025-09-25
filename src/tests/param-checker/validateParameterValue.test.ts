// tests/param-checker/validateParameterValue.test.ts
import { describe, it, expect } from "vitest";
import { readJsonFixture, assertOk } from "../_helpers";

import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
import { validateParameterValue } from "~/lib/params/paramChecker";
// Use your real summarizer (export it or re-export from a tiny util if needed)
import { summarizeSchema } from "~/lib/parse/parseAikenBlueprint";

/* ----------------------------------------------------------------
 * 0) Shared test typings
 * ---------------------------------------------------------------- */

export type Kind =
  | "int" | "bytes" | "string" | "boolean" | "unit"
  | "list:int" | "list:bytes" | "list:union"
  | "pair:int-bytes" | "map:string-int" | "ctor" | "opaque" | "unknown";

export type MatrixEntry = {
  valids: ReadonlyArray<unknown>;
  invalids: ReadonlyArray<unknown>;
  // Pass-through to validateParameterValue's cfg param
  cfg?: Parameters<typeof validateParameterValue>[3];
};

// Wrap values so Vitest always passes exactly one param to the callback.
type Case = { value: unknown };
const toCases = (arr: ReadonlyArray<unknown>): ReadonlyArray<Case> =>
  arr.map((v): Case => ({ value: v }));

/* ----------------------------------------------------------------
 * 1) Map summarizeSchema().typeHint → coarse kind buckets
 * ---------------------------------------------------------------- */

export function hintToKind(hint: string): Kind {
  if (hint === "integer" || hint === "#integer") return "int";
  if (hint === "bytes"   || hint === "#bytes")   return "bytes";
  if (hint === "string"  || hint === "#string")  return "string";
  if (hint === "boolean" || hint === "#boolean") return "boolean";
  if (hint === "unit"    || hint === "#unit")    return "unit";

  if (hint.startsWith("list<")) {
    if (hint.includes(" | "))   return "list:union";
    if (hint.includes("bytes")) return "list:bytes";
    return "list:int";
  }

  if (hint.startsWith("pair<")) return "pair:int-bytes"; // coarse bucket for matrix
  if (hint.startsWith("map<"))  return "map:string-int"; // coarse bucket
  if (hint === "opaque{}")      return "opaque";
  if (hint.startsWith("constructor[")) return "ctor";

  // Note: "ref:#/definitions/..." will fall through to "unknown" (skipped in matrix).
  return "unknown";
}

/* ----------------------------------------------------------------
 * 2) Value matrix per kind (valids/invalids + optional cfg)
 * ---------------------------------------------------------------- */

export const VALUES: Record<Kind, MatrixEntry> = {
  int:     { valids: [0, 1, -5, 1n] as const, invalids: [1.1, "1", null, {}] as const },
  bytes:   { valids: ["", "00", "AA", "deadBEEF"] as const, invalids: ["0", "xz", 10, null] as const },
  string:  { valids: ["", "hello"] as const, invalids: [1, true, null, {}] as const },
  boolean: { valids: [true, false] as const, invalids: [0, "true", null, {}] as const },
  unit:    { valids: [null, {}] as const, invalids: [0, "", { a: 1 }, []] as const },

  "list:int":   { valids: [[], [1, 2, 3], [1n]] as const, invalids: [["x"], "nope", null] as const },
  "list:bytes": { valids: [[], ["", "aa", "BB"]] as const, invalids: [["a"], [1], "nope"] as const },
  "list:union": { valids: [[], [1, "aa", 2n, ""]] as const, invalids: [["zz"], [1, "a"]] as const },

  "pair:int-bytes": {
    valids: [[1, "aa"], [0, ""]] as const,
    invalids: [[], [1], [1, "a"], ["aa", 1], [1, 2]] as const,
  },

  "map:string-int": {
    // Default cfg accepts array-of-tuples only.
    valids: [[], [["k", 1], ["b", 2n]]] as const,
    invalids: [[["k"]], [["k", "x"]], [{ a: 1 }], "nope"] as const,
  },

  ctor: {
    // For blueprint params that are constructors; exact fields vary by schema.
    // Local-node tests can refine this further if needed.
    valids: [{ constructor: 0, fields: [] }] as const,
    invalids: [{}, { constructor: 7, fields: [] }] as const,
  },

  opaque:  {
    valids: [1, 1n, "", "aa", [], {}, { constructor: 0, fields: [] }] as const,
    invalids: [undefined, () => {}] as const
  },

  unknown: { valids: [] as const, invalids: ["anything"] as const },
} satisfies Record<Kind, MatrixEntry>;

/* ----------------------------------------------------------------
 * 3) Load and validate the blueprints once
 * ---------------------------------------------------------------- */

function loadBlueprint(filename: string): AikenBlueprint {
  const raw = readJsonFixture(filename);
  const v = validateAikenBlueprint<AikenBlueprint>(raw);
  assertOk(v);
  return v.data;
}
const dedog   = loadBlueprint("dedog.blueprint.json");
const asteria = loadBlueprint("asteria.blueprint.json");

/* ----------------------------------------------------------------
 * 4) Extract parameter schemas from a blueprint
 * ---------------------------------------------------------------- */

function extractParams(bp: AikenBlueprint): Array<{ name: string; schema: SchemaNode }> {
  const out: Array<{ name: string; schema: SchemaNode }> = [];
  for (const v of bp.validators) {
    if (!Array.isArray(v.parameters)) continue;
    for (const p of v.parameters) {
      out.push({ name: `${v.title}::${p.title}`, schema: p.schema as SchemaNode });
    }
  }
  return out;
}

/* ----------------------------------------------------------------
 * 5) Run matrix over dedog & asteria parameter schemas
 * ---------------------------------------------------------------- */

describe("validateParameterValue — matrix over dedog & asteria parameter schemas", () => {
  const suites = [
    { label: "dedog", bp: dedog },
    { label: "asteria", bp: asteria },
  ];

  for (const { label, bp } of suites) {
    const defs = (bp.definitions ?? {}) as NonNullable<AikenBlueprint["definitions"]>;

    for (const { name, schema } of extractParams(bp)) {
      const hint = summarizeSchema(schema).typeHint;
      const kind = hintToKind(hint);
      const entry = VALUES[kind as keyof typeof VALUES];
      if (!entry) continue; // skip kinds we didn't bucket yet

      describe(`${label}:${name} [${hint} → ${kind}]`, () => {
        const validCases   = toCases(entry.valids);
        const invalidCases = toCases(entry.invalids);

        it.each<Case>(validCases)("accepts valid[%#]", ({ value }) => {
          const res = validateParameterValue(schema, value, defs, entry.cfg);
          if (!res.ok) console.log(`REJECTED valid ${label}:${name}`, { hint, kind, value, message: res.message });
          expect(res.ok, `${label}:${name} value=${JSON.stringify(value)} should be accepted`).toBe(true);
        });

        it.each<Case>(invalidCases)("rejects invalid[%#]", ({ value }) => {
          const res = validateParameterValue(schema, value, defs, entry.cfg);
          expect(res.ok, `${label}:${name} value=${JSON.stringify(value)} should be rejected`).toBe(false);
        });
      });
    }
  }
});

/* ----------------------------------------------------------------
 * 6) Gap coverage with local nodes (covers kinds fixtures may miss)
 * ---------------------------------------------------------------- */

describe("validateParameterValue — gap coverage with local nodes", () => {
    // Tiny builders for schemas
    const hash = (t: string) => ({ dataType: t } as any);
    const dlist = (item: SchemaNode | SchemaNode[]) => ({ dataType: "list", items: item } as any);
    const hlist = (item: SchemaNode | SchemaNode[]) => ({ dataType: "#list", items: item } as any);
    const hpair = (L: SchemaNode, R: SchemaNode) => ({ dataType: "#pair", left: L, right: R } as any);
    const dmap  = (K: SchemaNode, V: SchemaNode) => ({ dataType: "map", keys: K, values: V } as any);
    const ctor  = (index: number, fields: SchemaNode[]) => ({ index, fields });
    const ctors = (alts: any[]) => ({ anyOf: alts } as any);
  
    // Optional defs to test $ref
    const defs = {
      Int:   hash("#integer"),
      Bytes: hash("#bytes"),
    } as NonNullable<AikenBlueprint["definitions"]>;
  
    type Case = { value: unknown };
    const toCases = (arr: ReadonlyArray<unknown>): ReadonlyArray<Case> =>
      arr.map((v): Case => ({ value: v }));
  
    /* ---------- map object-form (cfg.mapAccepts) ---------- */
    describe("map<string,int> — object-form vs array-tuples", () => {
      const node = dmap(hash("#string"), hash("#integer"));
      const objOk = { a: 1, b: 2n };
      const objBadVal = { a: "x" };
      const tupleOk = [ ["a", 1], ["b", 2n] ] as const;
  
      it("accepts array-tuples by default; rejects object by default", () => {
        expect(validateParameterValue(node, tupleOk, defs).ok).toBe(true);
        expect(validateParameterValue(node, objOk, defs).ok).toBe(false);
      });
  
      it("accepts object when cfg.mapAccepts='object' or 'both'", () => {
        expect(validateParameterValue(node, objOk, defs, { mapAccepts: "object" }).ok).toBe(true);
        expect(validateParameterValue(node, objOk, defs, { mapAccepts: "both"   }).ok).toBe(true);
        // bad value type under object-form
        expect(validateParameterValue(node, objBadVal, defs, { mapAccepts: "object" }).ok).toBe(false);
      });
    });
  
    /* ---------- unit config variants ---------- */
    describe("#unit — config variants", () => {
      const node = hash("#unit");
      it("null-only", () => {
        expect(validateParameterValue(node, null, defs, { unitAccepts: "null" }).ok).toBe(true);
        expect(validateParameterValue(node, {},   defs, { unitAccepts: "null" }).ok).toBe(false);
      });
      it("{}-only", () => {
        expect(validateParameterValue(node, {},   defs, { unitAccepts: "empty-object" }).ok).toBe(true);
        expect(validateParameterValue(node, null, defs, { unitAccepts: "empty-object" }).ok).toBe(false);
      });
      it("both (default)", () => {
        expect(validateParameterValue(node, null, defs).ok).toBe(true);
        expect(validateParameterValue(node, {},   defs).ok).toBe(true);
      });
    });
  
    /* ---------- constructors with fields ---------- */
    describe("constructors — index match, arity, field types", () => {
      // constructor[ C0(int, bytes) | C1() ]
      const node = ctors([
        ctor(0, [hash("#integer"), hash("#bytes")]),
        ctor(1, []),
      ]);
  
      const valids   = toCases([{ constructor: 0, fields: [1, "aa"] }, { constructor: 1, fields: [] }]);
      const invalids = toCases([
        {}, // wrong shape
        { constructor: 7, fields: [] },               // unknown ctor
        { constructor: 0, fields: [1] },              // arity mismatch
        { constructor: 0, fields: ["x", "aa"] },      // field 0 not int
        { constructor: 0, fields: [1, "a"] },         // field 1 not bytes (odd hex)
      ]);
  
      it.each<Case>(valids)("accepts valid ctor[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
  
      it.each<Case>(invalids)("rejects invalid ctor[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    /* ---------- list union (alternatives) ---------- */
    describe("list union — [#integer | #bytes]", () => {
      const node = hlist([hash("#integer"), hash("#bytes")]);
      const valids   = toCases([[], [1, "aa", 2n, ""]]);
      const invalids = toCases([[ "zz" ], [ 1, "a" ]]); // "a" odd-length hex
  
      it.each<Case>(valids)("accepts valid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    /* ---------- pair<int, bytes> ---------- */
    describe("pair<int,bytes>", () => {
      const node = hpair(hash("#integer"), hash("#bytes"));
      const valids   = toCases([[1, "aa"], [0, ""]]);
      const invalids = toCases([[], [1], [1, "a"], ["aa", 1], [1, 2]]);
  
      it.each<Case>(valids)("accepts valid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    /* ---------- $ref resolution integration ---------- */
    describe("$ref resolution", () => {
      const refToInt   = { $ref: "#/definitions/Int"   } as any as SchemaNode;
      const refToBytes = { $ref: "#/definitions/Bytes" } as any as SchemaNode;
  
      it("follows refs for primitives", () => {
        expect(validateParameterValue(refToInt,   1,  defs).ok).toBe(true);
        expect(validateParameterValue(refToInt,   "x", defs).ok).toBe(false);
        expect(validateParameterValue(refToBytes, "aa", defs).ok).toBe(true);
        expect(validateParameterValue(refToBytes, "a",  defs).ok).toBe(false);
      });
  
      it("follows refs nested in list", () => {
        const node = dlist(refToBytes);
        expect(validateParameterValue(node, ["", "aa"], defs).ok).toBe(true);
        expect(validateParameterValue(node, ["a"],      defs).ok).toBe(false);
      });
    });
  });

// ---- Strict Aiken blueprint: nested/composite stress cases ----
describe("validateParameterValue — strict Aiken nested/composite stress", () => {
    // Small schema builders
    const hash = (t: string) => ({ dataType: t } as any);
    const dlist = (item: SchemaNode | SchemaNode[]) => ({ dataType: "list", items: item } as any);
    const hlist = (item: SchemaNode | SchemaNode[]) => ({ dataType: "#list", items: item } as any);
    const hpair = (L: SchemaNode, R: SchemaNode) => ({ dataType: "#pair", left: L, right: R } as any);
    const dmap  = (K: SchemaNode, V: SchemaNode) => ({ dataType: "map", keys: K, values: V } as any);
    const ctor  = (index: number, fields: SchemaNode[]) => ({ index, fields });
    const ctors = (alts: any[]) => ({ anyOf: alts } as any);
    const ref = (path: string) => ({ $ref: path } as any as SchemaNode);
  
    // Minimal definitions to exercise $ref (including a ref chain)
    const defs = {
      Int: hash("#integer"),
      Bytes: hash("#bytes"),
      Str: hash("#string"),
      // deep chain: A -> B -> #bytes
      A: ref("#/definitions/B"),
      B: ref("#/definitions/Bytes"),
    } as NonNullable<AikenBlueprint["definitions"]>;
  
    type Case = { value: unknown };
    const toCases = (arr: ReadonlyArray<unknown>): ReadonlyArray<Case> =>
      arr.map((v): Case => ({ value: v }));
  
    // 1) list<map<string, bytes>>  (data list + data map)
    describe("list<map<string, bytes>>", () => {
      const node = dlist(dmap(hash("#string"), hash("#bytes")));
      const valids   = toCases([[], [[["k", "aa"]]], [[["a", ""], ["b", "BB"]]]]);
      const invalids = toCases([
        "nope",
        [[["k", 1]]],             // value not bytes
        [[["k"]]],                // bad tuple arity
        [[{ k: "aa" }]],          // object-form rejected by default
      ]);
  
      it.each<Case>(valids)("accepts valid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    // 2) map<string, list<int>> (data map + data list)
    describe("map<string, list<int>>", () => {
      const node = dmap(hash("#string"), dlist(hash("#integer")));
      const valids   = toCases([[["xs", [1, 2, 3]]], []]);
      const invalids = toCases([
        [["xs", ["x"]]],      // inner list element wrong type
        [["xs", "not-list"]], // value not list
      ]);
  
      it.each<Case>(valids)("accepts valid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    // 3) map with UNION values: values ∈ (#integer | #bytes)
    describe("map<string, (int | bytes)>", () => {
        // Tiny builders scoped to this block
        const hash = (t: string) => ({ dataType: t } as any);
        const dlist = (item: SchemaNode | SchemaNode[]) => ({ dataType: "list", items: item } as any);
        const dmap  = (K: SchemaNode, V: SchemaNode) => ({ dataType: "map", keys: K, values: V } as any);
      
        type Case = { value: unknown };
        const toCases = (arr: ReadonlyArray<unknown>): ReadonlyArray<Case> =>
          arr.map((v): Case => ({ value: v }));
      
        // No defs needed here
        const defs = {} as NonNullable<AikenBlueprint["definitions"]>;
      
        it("rejects direct union at value position (unsupported in this validator)", () => {
          // ❌ Unsupported: putting an alternatives array directly at map.values
          const badUnionValue = { items: [hash("#integer"), hash("#bytes")] } as any;
          const node = dmap(hash("#string"), badUnionValue);
      
          const value = [["a", 1], ["b", "aa"]];
          const res = validateParameterValue(node, value, defs);
      
          expect(res.ok).toBe(false);
          if (!res.ok) {
            // Keep message check loose; exact text can vary with future tweaks
            expect(res.message).toMatch(/Unsupported schema node|Entry \d+ value:/);
          }
        });
      
        describe("workaround: map<string, list<int | bytes>> (supported)", () => {
          // ✅ Supported: put the union inside a LIST, so each map value is a list whose elements are int|bytes
          const node = dmap(hash("#string"), dlist([hash("#integer"), hash("#bytes")] as any));
      
          const ok = toCases([
            [], // empty map
            [["a", [1]], ["b", ["aa", 2n]]],
          ]);
      
          const bad = toCases([
            [["a", 1]],          // value is not a list
            [["a", ["a"]]],      // odd-length hex inside list
            "not-a-map" as any,  // whole thing not a map
          ]);
      
          it.each<Case>(ok)("accepts valid[%#]", ({ value }) => {
            expect(validateParameterValue(node, value, defs).ok).toBe(true);
          });
      
          it.each<Case>(bad)("rejects invalid[%#]", ({ value }) => {
            expect(validateParameterValue(node, value, defs).ok).toBe(false);
          });
        });
      
        describe("workaround + object-form (cfg.mapAccepts='object')", () => {
          const node = dmap(hash("#string"), dlist([hash("#integer"), hash("#bytes")] as any));
      
          it("accepts object-form when enabled; rejects bad shapes", () => {
            // object-form enabled
            expect(
              validateParameterValue(node, { a: [1, "aa"], b: [2n] }, defs, { mapAccepts: "object" }).ok
            ).toBe(true);
      
            // wrong: value not a list
            expect(
              validateParameterValue(node, { a: 1 }, defs, { mapAccepts: "object" }).ok
            ).toBe(false);
      
            // wrong: list element fails hex rule
            expect(
              validateParameterValue(node, { a: ["a"] }, defs, { mapAccepts: "object" }).ok
            ).toBe(false);
          });
        });
      });
  
    // 4) constructor with composite fields: C0(list<int>, map<string,int>), C1()
    describe("constructor with composite fields", () => {
      const node = ctors([
        ctor(0, [dlist(hash("#integer")), dmap(hash("#string"), hash("#integer"))]),
        ctor(1, []),
      ]);
  
      const valids = toCases([
        { constructor: 0, fields: [[1, 2, 3], [["a", 1], ["b", 2]]] },
        { constructor: 1, fields: [] },
      ]);
      const invalids = toCases([
        { constructor: 0, fields: [["x"], [["a", 1]]]},    // list<int> bad element
        { constructor: 0, fields: [[1], [{ a: 1 }]]},      // map object form rejected by default
        { constructor: 0, fields: [[1], [["a", "x"]]]},    // map value wrong type
        { constructor: 0, fields: [[1]] },                 // arity mismatch
        { constructor: 7, fields: [] },                    // unknown ctor
      ]);
  
      it.each<Case>(valids)("accepts valid ctor[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid ctor[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    // 5) pair<list<int>, bytes>
    describe("pair<list<int>, bytes>", () => {
      const node = hpair(dlist(hash("#integer")), hash("#bytes"));
      const valids   = toCases([[[1, 2], "aa"]]);
      const invalids = toCases([
        [[], "a"],           // right not bytes (odd hex)
        [["x"], "aa"],       // left element wrong type
        [1, "aa"],           // not a pair
        [[1, 2, 3]],         // arity != 2
      ]);
  
      it.each<Case>(valids)("accepts valid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(invalids)("rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  
    // 6) nested opaque: list<{}> and map<string, {}>
    describe("nested opaque acceptance", () => {
      const listOpaque = dlist({} as any);
      const mapOpaque  = dmap(hash("#string"), {} as any);
  
      // Any valid Plutus Data allowed inside those positions
      const validsList = toCases([ [1, "aa", [], { constructor: 0, fields: [] }] ]);
      const validsMap  = toCases([ [["a", 1]], [["b", "aa"]], [["c", { constructor: 0, fields: [] }]] ]);
      const invalidMap = toCases([ "not-a-map" ]);
  
      it.each<Case>(validsList)("list<{}> accepts valid data[%#]", ({ value }) => {
        expect(validateParameterValue(listOpaque, value, defs).ok).toBe(true);
      });
  
      it.each<Case>(validsMap)("map<string, {}> accepts valid pairs[%#]", ({ value }) => {
        expect(validateParameterValue(mapOpaque, value, defs).ok).toBe(true);
      });
  
      it.each<Case>(invalidMap)("map<string, {}> rejects invalid[%#]", ({ value }) => {
        expect(validateParameterValue(mapOpaque, value, defs).ok).toBe(false);
      });
    });
  
    // 7) deep $ref chain used in composite: list<ref(A)> where A -> B -> #bytes
    describe("deep $ref chain in composite", () => {
      const node = dlist(ref("#/definitions/A"));
      const ok   = toCases([["", "aa", "BB"]]);
      const bad  = toCases([["a"], [1]]);
  
      it.each<Case>(ok)("accepts valid bytes via refs[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(true);
      });
      it.each<Case>(bad)("rejects invalid via refs[%#]", ({ value }) => {
        expect(validateParameterValue(node, value, defs).ok).toBe(false);
      });
    });
  });    