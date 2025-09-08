// src/lib/cip57/schema.ts
import { z } from "zod";

/**
 * Helpers
 */
const HEX = /^0x?[0-9a-fA-F]*$/;
const INT_STR = /^-?\d+$/;

function toBigIntLike(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
  if (typeof v === "string" && INT_STR.test(v)) return BigInt(v);
  return null;
}
const zIntLike = z
  .union([z.number().int(), z.string().regex(INT_STR, "must be an integer string")])
  .refine((v) => toBigIntLike(v) !== null, "must be an integer");

const zNonNegIntLike = zIntLike.refine(
  (v) => (toBigIntLike(v) as bigint) >= 0n,
  "must be a non-negative integer"
);
const zPosIntLike = zIntLike.refine(
  (v) => (toBigIntLike(v) as bigint) > 0n,
  "must be a strictly positive integer"
);

/**
 * CIP-57 Purposes
 * Spec: purpose ∈ {"spend","mint","withdraw","publish"} (or oneOf of those).
 * Ref: “redeemer, datum and parameters” + purpose note. 
 * (Purpose is optional generally; many examples include datum/spend.)
 */
export const Cip57PurposeSchema = z.enum(["spend", "mint", "withdraw", "publish"]);
export type Cip57Purpose = z.infer<typeof Cip57PurposeSchema>;

/**
 * CIP-57 Core vocabulary values for dataType.
 * Ref: Core vocabulary table (integer/bytes/list/map/constructor + discouraged #builtins).
 */
export const Cip57DataTypeSchema = z.enum([
  "integer",
  "bytes",
  "list",
  "map",
  "constructor",
  "#unit",
  "#boolean",
  "#integer",
  "#bytes",
  "#string",
  "#pair",
  "#list",
]);
export type Cip57DataType = z.infer<typeof Cip57DataTypeSchema>;

/**
 * Reusable “hex string” validator for bytes enum (even length, optional 0x).
 * Ref: bytes keywords operate on hex-encoded strings.
 */
const zHexEven = z
  .string()
  .regex(HEX, "must be hex (optional 0x prefix)")
  .refine((s) => ((s.startsWith("0x") ? s.slice(2) : s).length % 2) === 0, "hex length must be even");

/**
 * Forward declarations (mutual recursion).
 */
export type Cip57Schema = z.infer<typeof Cip57Schema>;
export type Cip57Arg = z.infer<typeof Cip57ArgSchema>;
export type Cip57Validator = z.infer<typeof Cip57ValidatorSchema>;
export type Cip57Blueprint = z.infer<typeof Cip57BlueprintSchema>;

/**
 * Plutus Data Schema (CIP-57)
 * We model one consolidated object with all possible keywords and
 * enforce correctness via refinements based on `dataType`.
 *
 * Allowed applicators at any level: allOf / anyOf / oneOf / not (non-empty arrays).
 * Ref: Additional keywords + applicators.
 */
export const Cip57Schema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      // General
      dataType: Cip57DataTypeSchema.optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      $comment: z.string().optional(),

      // Applicators (non-empty)
      allOf: z.array(Cip57Schema).nonempty().optional(),
      anyOf: z.array(Cip57Schema).nonempty().optional(),
      oneOf: z.array(Cip57Schema).nonempty().optional(),
      not: z.lazy(() => Cip57Schema).optional(),

      // $ref (allowed with siblings in JSON Schema 2020-12; spec doesn’t forbid)
      $ref: z.string().optional(),

      // BYTES-only keywords
      enum: z.array(zHexEven).optional(),
      maxLength: zNonNegIntLike.optional(), // measured in bytes
      minLength: zNonNegIntLike.optional(),

      // INTEGER-only keywords
      multipleOf: zPosIntLike.optional(),
      maximum: zIntLike.optional(),
      exclusiveMaximum: zIntLike.optional(),
      minimum: zIntLike.optional(),
      exclusiveMinimum: zIntLike.optional(),

      // LIST-only keywords
      items: z.union([z.lazy(() => Cip57Schema), z.array(z.lazy(() => Cip57Schema))]).optional(),
      maxItems: zNonNegIntLike.optional(),
      minItems: zNonNegIntLike.optional(),
      uniqueItems: z.boolean().optional(),

      // MAP-only keywords
      keys: z.lazy(() => Cip57Schema).optional(),
      values: z.lazy(() => Cip57Schema).optional(),

      // CONSTRUCTOR-only keywords (both mandatory when dataType="constructor")
      index: zNonNegIntLike.optional(),
      fields: z.array(z.lazy(() => Cip57Schema)).optional(),
    })
    .passthrough()
    .superRefine((obj, ctx) => {
      const dt = obj.dataType as Cip57DataType | undefined;

      // BYTES keywords must only appear with dataType="bytes"
      if ((obj.enum || obj.maxLength !== undefined || obj.minLength !== undefined) && dt !== "bytes") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'bytes keywords ("enum","maxLength","minLength") require dataType="bytes"',
          path: [],
        });
      }

      // INTEGER keywords must only appear with dataType="integer"
      if (
        (obj.multipleOf !== undefined ||
          obj.maximum !== undefined ||
          obj.exclusiveMaximum !== undefined ||
          obj.minimum !== undefined ||
          obj.exclusiveMinimum !== undefined) &&
        dt !== "integer"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'integer keywords ("multipleOf","maximum","exclusiveMaximum","minimum","exclusiveMinimum") require dataType="integer"',
          path: [],
        });
      }

      // LIST keywords must only appear with dataType="list"
      if ((obj.items !== undefined || obj.maxItems !== undefined || obj.minItems !== undefined || obj.uniqueItems !== undefined) && dt !== "list") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'list keywords ("items","maxItems","minItems","uniqueItems") require dataType="list"',
          path: [],
        });
      }

      // MAP keywords must only appear with dataType="map"
      if ((obj.keys !== undefined || obj.values !== undefined) && dt !== "map") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'map keywords ("keys","values") require dataType="map"',
          path: [],
        });
      }

      // CONSTRUCTOR rules:
      //  - If dataType="constructor" => both index & fields are mandatory
      //  - If index/fields present => dataType MUST be "constructor"
      const hasIndex = obj.index !== undefined;
      const hasFields = obj.fields !== undefined;
      if (dt === "constructor") {
        if (!hasIndex || !hasFields) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'constructor requires both "index" (non-negative int) and "fields" (array)',
            path: [],
          });
        }
      } else if (hasIndex || hasFields) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '"index"/"fields" can only be used with dataType="constructor"',
          path: [],
        });
      }
    })
);

/**
 * Arg schema
 * purpose: string or { oneOf: Cip57Purpose[] }
 * schema:  Cip57Schema or { oneOf: Cip57Schema[] }
 */
const PurposeOneOf = z.object({ oneOf: z.array(Cip57PurposeSchema).nonempty() });
const SchemaOneOf = z.object({ oneOf: z.array(Cip57Schema).nonempty() });

export const Cip57ArgSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    purpose: z.union([Cip57PurposeSchema, PurposeOneOf]).optional(),
    schema: z.union([Cip57Schema, SchemaOneOf]),
  })
  .passthrough();

/**
 * Utilities to extract purposes for arg-level oneOf discriminant checks.
 */
function extractPurposes(arg: unknown): Cip57Purpose[] {
  const a = arg as any;
  const p = a?.purpose;
  if (!p) return [];
  if (typeof p === "string") return [p as Cip57Purpose];
  if (p && Array.isArray(p.oneOf)) return p.oneOf as Cip57Purpose[];
  return [];
}

function purposesDisjoint(list: Cip57Purpose[][]): boolean {
  const seen = new Set<string>();
  for (const arr of list) {
    for (const item of arr) {
      if (seen.has(item)) return false;
      seen.add(item);
    }
  }
  return true;
}

/**
 * Validator schema
 * Required: title, redeemer.
 * Optional: datum, parameters, compiledCode/hash (paired), plutusVersion.
 *
 * Additional rule from spec:
 *  - If an argument is expressed as { oneOf: [Arg, ...] }, the branches’ purposes must be strictly non-overlapping
 *    (they’re used as a discriminator). We enforce this for redeemer/datum/each parameter entry.
 *
 * Datums frequently carry purpose "spend" in examples, but the spec treats purpose as optional (we don’t hard-require it),
 * while noting datum as a special case in rationale; we keep purpose optional for compatibility with existing tools.
 */
export const Cip57ValidatorSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),

    redeemer: z.union([Cip57ArgSchema, z.object({ oneOf: z.array(Cip57ArgSchema).nonempty() })]),
    datum: z
      .union([Cip57ArgSchema, z.object({ oneOf: z.array(Cip57ArgSchema).nonempty() })])
      .optional(),
    parameters: z
      .array(z.union([Cip57ArgSchema, z.object({ oneOf: z.array(Cip57ArgSchema).nonempty() })]))
      .optional(),

    plutusVersion: z.string().optional(),
    compiledCode: z.string().optional(),
    hash: z.string().optional(),
  })
  .passthrough()
  .superRefine((v, ctx) => {
    // compiledCode => hash mandatory
    if (v.compiledCode && !v.hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "If compiledCode is present, hash must also be present",
        path: ["hash"],
      });
    }

    // Arg-level oneOf must have non-overlapping purposes (used as discriminant)
    const checkArgOneOf = (arg: unknown, path: (string | number)[]) => {
      const o = arg as any;
      if (!o || !o.oneOf) return;
      const sets = (o.oneOf as any[]).map(extractPurposes);
      // If any branch has no purpose, we can’t check overlap reliably → skip (spec allows optional)
      if (sets.some((s) => s.length === 0)) return;
      if (!purposesDisjoint(sets)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: "Branches in oneOf must have strictly non-overlapping purposes",
        });
      }
    };

    checkArgOneOf(v.redeemer, ["redeemer"]);
    if (v.datum) checkArgOneOf(v.datum, ["datum"]);
    if (Array.isArray(v.parameters)) {
      v.parameters.forEach((p, i) => checkArgOneOf(p, ["parameters", i]));
    }
  });

/**
 * Blueprint schema
 * Top-level fields per spec + common JSON-Schema meta fields.
 * validators: object (spec) OR array (de-facto from compilers) — support both.
 * definitions: registry of reusable schemas.
 */
export const Cip57BlueprintSchema = z
  .object({
    $schema: z.string().optional(),
    $id: z.string().optional(),
    $vocabulary: z.record(z.boolean()).optional(),

    preamble: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        version: z.string().optional(),
        compiler: z
          .object({
            name: z.string(),
            version: z.string().optional(),
          })
          .optional(),
        plutusVersion: z.string().optional(),
        license: z.string().optional(),
      })
      .optional(),

    validators: z.union([z.record(Cip57ValidatorSchema), z.array(Cip57ValidatorSchema)]),

    definitions: z.record(Cip57Schema).optional(),
  })
  .passthrough();