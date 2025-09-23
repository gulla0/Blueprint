import { z } from "zod";

/** ===== Helpers (keep your originals) ===== */
const HEX_RE = /^[0-9a-fA-F]+$/;
const HEX56_RE = /^[0-9a-fA-F]{56}$/;
const isEvenLengthHex = (s: string) => HEX_RE.test(s) && s.length % 2 === 0;
/** CBOR byte string major type (0x40..0x5F). Covers definite (0x40..0x5B) + indefinite (0x5F). */
const looksLikeCborByteString = (s: string) => {
  if (s.length < 2 || !HEX_RE.test(s)) return false;
  const first = parseInt(s.slice(0, 2), 16);
  return first >= 0x40 && first <= 0x5f;
};

/** ===== Base pieces ===== */
const RefOnly = z.object({ $ref: z.string() }).strict();
const EmptySchema = z.object({}).strict(); // Aiken's Data::Opaque (may also carry title/description via Annotated)

/** Annotatable wrapper (Aiken's Annotated<T> flattens title/description) */
const Annotatable = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

/** dataType enums (Aiken has two "namespaces") */
const PlutusDataType = z.enum(["integer", "bytes", "list", "map"]); // (Note: no "string" at Data layer)
const SchemaDataType = z.enum([
  "#unit",
  "#boolean",
  "#integer",
  "#bytes",
  "#string",
  "#list",
  "#pair",
]);

/** -----------------------------------------------------------
 * Data layer (Schema::Data) — inline JSON shapes
 * --------------------------------------------------------- */

/** Forward declarations (because of recursion) */
type ZAny = z.ZodTypeAny;
let DeclarationData: ZAny;
let ItemsData: ZAny;

/** Inline Data (may carry title/description via Annotated) */
const InlineData: z.ZodType<any> = Annotatable.and(
  z.union([
    // Opaque / doc-only: {}
    z.object({}).strict().passthrough(),

    // integer / bytes (no extras)
    z
      .object({
        dataType: z.enum(["integer", "bytes"]),
      })
      .strict()
      .passthrough(),

    // list: items: Items<Data>
    z
      .object({
        dataType: z.literal("list"),
        items: z.lazy(() => ItemsData),
      })
      .strict()
      .passthrough(),

    // map: keys: Declaration<Data>, values: Declaration<Data>
    z
      .object({
        dataType: z.literal("map"),
        keys: z.lazy(() => DeclarationData),
        values: z.lazy(() => DeclarationData),
      })
      .strict()
      .passthrough(),

    // anyOf: constructors (fields: Declaration<Data>[])
    z
      .object({
        anyOf: z.array(
          Annotatable.and(
            z
              .object({
                dataType: z.literal("constructor").optional(), // Aiken includes it; keep optional for leniency
                index: z.number().int(),
                fields: z.array(z.lazy(() => DeclarationData)).default([]),
              })
              .strict()
              .passthrough()
          )
        ),
      })
      .strict()
      .passthrough(),
  ])
);

/** Declaration<Data> = $ref OR inline Data */
DeclarationData = z.union([
  RefOnly,
  InlineData, // includes {} opaque and all Data forms; carries optional title/description
]);

/** Items<Data> = One(Declaration<Data>) OR Many(Annotated<Declaration<Data>>[]) */
ItemsData = z.union([
  z.lazy(() => DeclarationData),
  z.array(
    z.union([
      // Annotated $ref
      Annotatable.and(RefOnly),
      // Annotated InlineData
      InlineData,
    ])
  ),
]);

/** -----------------------------------------------------------
 * Schema layer (top-level Schema shape used in `definitions`)
 * --------------------------------------------------------- */

/** Forward declarations */
let DeclarationSchema: ZAny;
let ItemsSchema: ZAny;
let InlineSchema: ZAny;

/** Inline Schema (Annotated<Schema>) */
InlineSchema = Annotatable.and(
  z.union([
    // 1) Hash-prefixed schema wrappers
    //    - bare: #integer, #bytes, #string, #unit, #boolean
    z
      .object({
        dataType: z.enum(["#integer", "#bytes", "#string", "#unit", "#boolean"]),
      })
      .strict()
      .passthrough(),

    //    - #list: items: Items<Schema>
    z
      .object({
        dataType: z.literal("#list"),
        items: z.lazy(() => ItemsSchema),
      })
      .strict()
      .passthrough(),

    //    - #pair: left/right: Declaration<Schema>
    z
      .object({
        dataType: z.literal("#pair"),
        left: z.lazy(() => DeclarationSchema),
        right: z.lazy(() => DeclarationSchema),
      })
      .strict()
      .passthrough(),

    // 2) Schema::Data(...) — reuse the full Data layer inline shapes
    InlineData,
  ])
);

/** Declaration<Schema> = $ref OR inline Schema */
DeclarationSchema = z.union([RefOnly, InlineSchema]);

/** Items<Schema> = One(Declaration<Schema>) OR Many(Annotated<Declaration<Schema>>[]) */
ItemsSchema = z.union([
  z.lazy(() => DeclarationSchema),
  z.array(
    z.union([
      // Annotated $ref
      Annotatable.and(RefOnly),
      // Annotated inline schema
      InlineSchema,
    ])
  ),
]);

/** -----------------------------------------------------------
 * TypeDef (what `definitions` holds) = Annotated<Schema>
 * --------------------------------------------------------- */
const TypeDef: z.ZodType<any> = z.lazy(() => InlineSchema);

/** ===== SchemaRefOrInlineOrEmpty for datum/redeemer/parameters =====
 * Aiken allows: $ref | {} (opaque) | inline Schema (same as in definitions).
 */
const SchemaRefOrInlineOrEmpty = z.union([RefOnly, EmptySchema, TypeDef]);

/** ===== Datum/Redeemer + Parameters ===== */
const DatumOrRedeemer = z
  .object({
    title: z.string().optional(),
    schema: SchemaRefOrInlineOrEmpty,
  })
  .strict();

const Parameter = z
  .object({
    title: z.string(),
    schema: SchemaRefOrInlineOrEmpty,
  })
  .strict();

/** ===== Validator (unchanged) ===== */
const Validator = z
  .object({
    title: z.string(),
    datum: DatumOrRedeemer.optional(),
    redeemer: DatumOrRedeemer.optional(),
    parameters: z.array(Parameter).optional(),
    compiledCode: z
      .string()
      .min(1, "compiledCode cannot be empty")
      .refine(isEvenLengthHex, "compiledCode must be hex with even length")
      .refine(
        looksLikeCborByteString,
        "compiledCode should be a CBOR byte-string (starts 0x40–0x5F)"
      )
      .optional(),
    hash: z
      .string()
      .regex(HEX56_RE, "hash must be 56 hex chars (blake2b-224)")
      .optional(),
  })
  .superRefine((v, ctx) => {
    const isElse = v.title.trim().endsWith(".else");
    if (!isElse) {
      if (!v.compiledCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "compiledCode is required (non-.else validator)",
          path: ["compiledCode"],
        });
      }
    } else {
      if (!v.compiledCode && !v.hash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "For .else validators, provide compiledCode or hash",
          path: ["hash"],
        });
      }
    }
  });

/** ===== Final export (unchanged) ===== */
export const AikenPlutusJsonSchema = z
  .object({
    preamble: z
      .object({
        title: z.string(),
        description: z.string().optional(),
        version: z.string(),
        plutusVersion: z.enum(["v1", "v2", "v3"]),
        compiler: z.object({ name: z.string(), version: z.string() }).passthrough(),
        license: z.string().optional(),
      })
      .passthrough(),
    validators: z.array(Validator).min(1),
    definitions: z.record(TypeDef).optional(), // Annotated<Schema> by construction
  })
  .strict();