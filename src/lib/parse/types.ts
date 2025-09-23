import type {
    AikenBlueprint,
    SchemaNode, // exact: $ref | {} | InlineSchema
  } from "~/lib/AikenPlutusJsonSchema";
  
  /** Use the exact version literal from the schema */
  export type PlutusVersion = AikenBlueprint["preamble"]["plutusVersion"];
  
  /** The six ledger purposes we keep ('.else' will be filtered at parse time) */
  export type PurposeName =
    | "spend"
    | "mint"
    | "withdraw"
    | "publish"
    | "vote"
    | "propose";
  
  /** Human-friendly hint + the exact schema node for fidelity */
  export type SchemaSummary = {
    /** e.g., "bytes", "list<#integer>", "pair<bytes,#integer>", "ref:#/definitions/Foo", "opaque{}" */
    typeHint: string;
    raw: SchemaNode; // exact node from your Zod schema
  };
  
  /** One compile-time parameter shared by all purposes of a validator */
  export type ParsedParam = {
    name: string;          // Parameter.title
    schema: SchemaSummary; // exact schema node
  };
  
  /** Optional datum/redeemer summary per purpose */
  export type ParsedIO = {
    schema: SchemaSummary; // exact schema node
  };
  
  /** Per-purpose info (only what actually differs by purpose) */
  export type ParsedPurpose = {
    datum?: ParsedIO;
    redeemer?: ParsedIO;
  };
  
  /** A logical validator (base title without .spend/.mint/.../.else) */
  export type ParsedValidator = {
    /** Base name, e.g., "revenue.share" */
    name: string;
  
    /** Shared across all purposes */
    parameters: ParsedParam[];
  
    /** Shared CBOR + hash for the validator as a whole */
    compiledCode?: string; // hex CBOR
    hash?: string;         // 56-hex blake2b-224
  
    /** Purpose → datum/redeemer */
    purposes: Partial<Record<PurposeName, ParsedPurpose>>;
  };
  
  /** Final parsed shape */
  export type ParsedJson = {
    plutusVersion: PlutusVersion;
    /** Validators keyed by base name */
    validators: Record<string, ParsedValidator>;
  };