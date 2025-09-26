# 10 – Features (High-Level)

## Catalog

- **Types & Interfaces**
  - `ParsedJson`, `ParsedValidator`, `ParsedPurpose`, `PurposeName`, `PlutusVersion` (from `~/lib/types`)
  - `AikenBlueprint` (from `~/lib/AikenPlutusJsonSchema`)
- **Functions (public API)**
  - `validateAikenBlueprint(raw)` → success `{ ok: true, data }` / failure `{ ok: false, errors, issues }`
  - `parseAikenBlueprint(input)` → `ParsedJson` or failure `{ ok: false, errors, issues }`
  - `parseAikenBlueprintStrict(validated: AikenBlueprint)` → `ParsedJson`
- **Helpers (internal/public)**
  - `summarizeSchema(node)` → `{ typeHint, raw }` (exported; useful for UI/type hints)

These are your “grab-and-go” functions that sit on top of the schema and parsing utilities in `src/lib`.

---

## `parseAikenBlueprint(input)`

- **Purpose**: Validate (using the project’s schema) and then parse a raw Aiken `plutus.json` (or a JS object) into a friendly, purpose-keyed structure (`ParsedJson`) you can use directly (validators grouped by base name, purposes split out, common metadata lifted).
- **Source**: `src/lib/parseAikenBlueprint.ts`
- **Import**:

```ts
import { parseAikenBlueprint } from "~/lib/parseAikenBlueprint";
```

### Typical usage

```ts
const parsed = parseAikenBlueprint(rawJson);

// NOTE: this function returns EITHER a ParsedJson OR a failure object.
if (typeof parsed === "object" && "ok" in parsed && parsed.ok === false) {
  console.error("Parse failed:", parsed.errors);
} else {
  // parsed is ParsedJson here
  // e.g., parsed.validators["MyValidator"].purposes.spend?.redeemer
}
```

### Notes

- Skips `.else` entries and only keeps the six ledger purposes: `spend | mint | withdraw | publish | vote | propose`.
- Consolidates per-validator shared fields (params/CBOR/hash) once, even if multiple purposes exist.
- For stricter pipelines where you already have a validated object, use `parseAikenBlueprintStrict(validated)`.

---

## `validateAikenBlueprint(raw)`

- **Purpose**: Validate that an input conforms to the project’s Aiken blueprint schema (CIP-57 aware) and return precise, user-friendly errors.
- **Source**: `src/lib/validatePlutusJson.ts`
- **Import**:

```ts
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
```

### Typical usage

```ts
const check = validateAikenBlueprint(rawJson);

if (!check.ok) {
  // Human-oriented list
  console.table(check.errors); // [{ path, message, code }, ...]
  // If needed, raw Zod issues are in check.issues
} else {
  const blueprint = check.data; // <- NOTE: success uses `data`
  // Safe to pass to parseAikenBlueprintStrict(blueprint)
}
```

### What you get back

- Success: `{ ok: true, data: AikenBlueprint }`
- Failure: `{ ok: false, errors: {path,message,code}[], issues: ZodIssue[] }`

---

## Feature flow (recommended)

```ts
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
import { parseAikenBlueprint } from "~/lib/parseAikenBlueprint";

export function handleUpload(raw: unknown) {
  const validated = validateAikenBlueprint(raw);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors, issues: validated.issues };
  }

  const parsed = parseAikenBlueprint(validated.data);
  if (typeof parsed === "object" && "ok" in parsed && parsed.ok === false) {
    return { ok: false, errors: parsed.errors, issues: parsed.issues };
  }

  return { ok: true, blueprint: parsed }; // parsed is ParsedJson
}
```

---

## Related utilities

- `parseAikenBlueprintStrict(validated)`
  - Input must already be a valid `AikenBlueprint`.
  - Returns `ParsedJson` directly.
  - Useful in backends or after a guaranteed-valid step.
- `summarizeSchema(node)`
  - Returns `{ typeHint, raw }`, where `typeHint` is a compact description like `int`, `bytes`, `list<...>`, `pair<...>`, `constructor[...]`, or `ref:#/...`.
  - Handy for UI tooltips and parameter forms.

---

## What’s next?

- Core helpers: parameter checking, schema utilities → see `20-core.md`
- Types glossary: shared domain types → see `30-types.md`

---
