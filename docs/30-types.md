# 30 – Types Glossary

Authoritative reference for the types you’ll use across the Blueprint library.

---

## Catalog

- Zod-inferred (from `~/lib/AikenPlutusJsonSchema`)
  - `AikenBlueprint`
  - `SchemaNode`
  - `TypeDefNode`
  - `ValidatorNode`
  - `ParameterNode`
  - `DatumOrRedeemerNode`
- Param checker (from `~/lib/params/paramChecker`)
  - `ParamCheckSuccess`
  - `ParamCheckFailure`
  - `ParamCheckResult`
  - `ParamCheckConfig`
- Domain / parsed shapes (from `~/lib/types`)
  - `PlutusVersion`
  - `PurposeName`
  - `SchemaSummary`
  - `ParsedParam`
  - `ParsedIO`
  - `ParsedPurpose`
  - `ParsedValidator`
  - `ParsedJson`

---

## Sources

- `src/lib/AikenPlutusJsonSchema.ts` → Zod schemas + inferred types
- `src/lib/params/paramChecker.ts` → parameter validation results/config
- `src/lib/types.ts` → domain-facing parsed shapes

### Import style (current project)

```ts
import type {
  AikenBlueprint,
  SchemaNode,
  ValidatorNode,
  ParameterNode,
  DatumOrRedeemerNode,
  TypeDefNode,
} from "~/lib/AikenPlutusJsonSchema";

import type {
  PurposeName,
  PlutusVersion,
  SchemaSummary,
  ParsedParam,
  ParsedIO,
  ParsedPurpose,
  ParsedValidator,
  ParsedJson,
} from "~/lib/types";

import type {
  ParamCheckConfig,
  ParamCheckResult,
} from "~/lib/params/paramChecker";
```

---

### 1) Zod-inferred types (`AikenPlutusJsonSchema.ts`)

```ts
export type AikenBlueprint = z.infer<typeof AikenPlutusJsonSchema>;
export type SchemaNode = z.infer<typeof SchemaRefOrInlineOrEmpty>;
export type TypeDefNode = z.infer<typeof TypeDef>;
export type ValidatorNode = z.infer<typeof Validator>;
export type ParameterNode = z.infer<typeof Parameter>;
export type DatumOrRedeemerNode = z.infer<typeof DatumOrRedeemer>;
```

#### Notes

- AikenBlueprint: entire plutus.json object.
- SchemaNode: covers CIP-57 node kinds → primitive, composite, constructor, union (anyOf), $ref, or {} (opaque).
- TypeDefNode: entries under `#/definitions/*`.
- ValidatorNode: raw validator entry before parsing.
- ParameterNode: compile-time parameters.
- DatumOrRedeemerNode: schema for datum/redeemer.

---

### 2) Parameter validation types (`paramChecker.ts`)

```ts
export type ParamCheckSuccess = { ok: true };
export type ParamCheckFailure = { ok: false; message: string };
export type ParamCheckResult = ParamCheckSuccess | ParamCheckFailure;

export type ParamCheckConfig = {
  unitAccepts?: "null" | "empty-object" | "both"; // default: "both"
  mapAccepts?: "array-tuples" | "object" | "both"; // default: "array-tuples"
};
```

#### Example

```ts
import { validateParameterValue } from "~/lib/params/paramChecker";

const cfg: ParamCheckConfig = { unitAccepts: "both", mapAccepts: "both" };
const res: ParamCheckResult = validateParameterValue(
  schemaNode,
  userValue,
  cfg,
);
if (!res.ok) console.error(res.message);
```

---

### 3) Domain types (`types.ts`)

#### Ledger / Purpose

```ts
export type PlutusVersion = AikenBlueprint["preamble"]["plutusVersion"];

export type PurposeName =
  | "spend"
  | "mint"
  | "withdraw"
  | "publish" // ledger spec often calls this "cert"
  | "vote"
  | "propose";
```

#### Schema summaries

```ts
export type SchemaSummary = {
  typeHint: string; // e.g. "bytes", "pair<int,bytes>", "ref:#/definitions/Foo"
  raw: SchemaNode; // exact schema node
};
```

#### Parameters & IO

```ts
export type ParsedParam = {
  name: string;
  schema: SchemaSummary;
};

export type ParsedIO = {
  schema: SchemaSummary;
};
```

#### Per-purpose & validators

```ts
export type ParsedPurpose = {
  datum?: ParsedIO;
  redeemer?: ParsedIO;
};

export type ParsedValidator = {
  name: string;
  parameters: ParsedParam[];
  compiledCode?: string; // hex CBOR
  hash?: string; // 56-char blake2b-224
  purposes: Partial<Record<PurposeName, ParsedPurpose>>;
};

export type ParsedJson = {
  plutusVersion: PlutusVersion;
  validators: Record<string, ParsedValidator>;
};
```

---

### 4) Practical tips

- Schema fidelity → import Zod-inferred (`AikenBlueprint`, `SchemaNode`).
- App logic → import domain types (`ParsedJson`, `ParsedValidator`).
- If in doubt, check `AikenPlutusJsonSchema.ts` → that’s the ultimate source.

---

### 5) “Publish” vs “Cert”

- Aiken source code uses Publish (pub) for the script purpose.
- Ledger / Plutus docs often call this Cert.
- This library standardizes on publish in types, while leaving interop layers free to alias it.
