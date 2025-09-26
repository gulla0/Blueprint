# 20 – Core (Low-Level Helpers)

> Catalog

- **Types & Interfaces**
  - `ParamCheckSuccess`, `ParamCheckFailure`, `ParamCheckResult`, `ParamCheckConfig` (from `~/lib/params/paramChecker`)
  - `AikenBlueprint` (from `~/lib/AikenPlutusJsonSchema`)
  - `SchemaNode` (from `~/lib/AikenPlutusJsonSchema`)
- **Functions (public API)**
  - `validateParameterValue(schema, value, config?)` → `ParamCheckResult`
  - `resolveRef(ref, definitions)` → `SchemaNode | undefined`
- **Schemas / Zod**
  - `AikenPlutusJsonSchema`
- **Helpers (internal)**
  - Default config inside `paramChecker.ts`: `{ unitAccepts: "both", mapAccepts: "array-tuples" }`

These utilities power high-level features and give you fine-grained control for parameter validation and schema navigation.

---

## `validateParameterValue(schema, value, config?)`

- **Purpose**: Validate a user-provided `value` against a CIP-57 `SchemaNode` (resolving local `$ref`s) and return a concise pass/fail result.
- **Source**: `src/lib/params/paramChecker.ts`
- **Import**:
  ```ts
  import { validateParameterValue } from "~/lib/params/paramChecker";
  ```

### Signature

```ts
function validateParameterValue(
  schema: SchemaNode,
  value: unknown,
  config?: ParamCheckConfig,
): ParamCheckResult;
```

### Return

- Success: { ok: true }
- Failure: { ok: false; message: string } (message is user-facing and explains the mismatch)

### Behavior & notes

- $ref resolution: Transparently follows local #/definitions/... references found in the same blueprint.
- Supported kinds (as described by CIP-57 nodes):
  - Primitives: int, bytes, string, boolean, unit
  - Collections: list<...>, pair<..., ...>, map<k, v>
- Config toggles (ParamCheckConfig):
  - unitAccepts: "null" | "empty-object" | "both" (default "both")
    - Example: accept null or {} for unit
  - mapAccepts: "array-tuples" | "object" | "both" (default "array-tuples")
    - Example inputs accepted for a map<string,int> when "both":
      - Array form: [["alice", 1], ["bob", 2]]
      - Object form: { "alice": 1, "bob": 2 }

### Typical usage

```ts
const result = validateParameterValue(schemaNode, userInput);
if (!result.ok) {
  console.error("Invalid parameter:", result.message);
}
```

### Examples

```ts
// 1) Unit acceptance
validateParameterValue(UnitSchema, null); // ok by default ("both")
validateParameterValue(UnitSchema, {}); // ok by default

// 2) Map acceptance (object form rejected unless configured)
validateParameterValue(MapStringIntSchema, { a: 1 }); // default: may fail
validateParameterValue(
  MapStringIntSchema,
  { a: 1, b: 2 },
  { mapAccepts: "both" },
); // passes

// 3) List of bytes
validateParameterValue(ListBytesSchema, ["0x00", "0xCAFE"]); // hex strings expected
```

---

## `resolveRef(ref, definitions)`

- Purpose: Resolve a local $ref (e.g., #/definitions/Int) against a blueprint’s definitions.
- Source: src/lib/parseAikenBlueprint.ts
- Import:

```ts
import { resolveRef } from "~/lib/parseAikenBlueprint";
```

### Signature

```ts
function resolveRef(
  ref: string,
  definitions: NonNullable<AikenBlueprint["definitions"]>,
): SchemaNode | undefined;
```

### Typical usage

```ts
const node = resolveRef("#/definitions/Int", blueprint.definitions);
```

Note: This helper only resolves local references in the same document. External refs/URLs are out of scope.

---

## `AikenPlutusJsonSchema`

- Purpose: Zod schema describing Aiken’s plutus.json structure; use it to validate a candidate blueprint.
- Source: src/lib/AikenPlutusJsonSchema.ts
- Import:

```ts
import { AikenPlutusJsonSchema } from "~/lib/AikenPlutusJsonSchema";
```

### Typical usage

```ts
const check = AikenPlutusJsonSchema.safeParse(rawJson);
if (!check.success) {
  console.error("Schema mismatch:", check.error.issues);
}
```

---

## Types

These helpers rely on shared domain types (e.g., SchemaNode, AikenBlueprint). See 30-types.md for the full glossary.

---

## When to use core helpers

- Frontend inline validation: Validate as the user types into a param form.
- Custom parsing flows: Resolve $refs or inspect nodes before building UI.
- Debugging: Pinpoint exactly which field violates the expected schema.

---
