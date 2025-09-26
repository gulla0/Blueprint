## Cookbook (Examples & Recipes)

Practical, paste-ready snippets that use the current files in `src/lib`.

### Imports used below (adjust if you move files)

```ts
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
import { parseAikenBlueprint } from "~/lib/parseAikenBlueprint";
import { validateParameterValue } from "~/lib/params/paramChecker";

import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";

import type {
  ParamCheckConfig,
  ParamCheckResult,
} from "~/lib/params/paramChecker";
```

> If your parse exports helpers like `resolveRef`, import them as well.

---

### 1) Safe Upload Flow (validate → parse)

Validate first for user feedback, then parse for structured access.

```ts
export function handleBlueprintUpload(raw: unknown) {
  // Step 1: Validate JSON matches Aiken blueprint shape
  const validated = validateAikenBlueprint(raw);
  if (!validated.ok) {
    // Report precise issues to the UI
    return {
      ok: false as const,
      stage: "validate" as const,
      errors: validated.errors, // [{ path, message, code }, ...] user-friendly
      issues: validated.issues, // raw Zod issues (optional for debugging)
    };
  }

  // Step 2: Parse into convenient structure
  const parsed = parseAikenBlueprint(validated.data);
  if (typeof parsed === "object" && "ok" in parsed && parsed.ok === false) {
    return {
      ok: false as const,
      stage: "parse" as const,
      errors: parsed.errors ?? [],
      issues: parsed.issues ?? [],
    };
  }

  // Step 3: Success
  return {
    ok: true as const,
    blueprint: parsed, // ParsedJson
  };
}
```

> UI idea: if `stage === "validate"`, highlight file errors; if `stage === "parse"`, highlight app-specific parse issues.

---

### 2) Friendly Error Table (paths + messages)

Turn validator errors into a user-friendly table or list.

```ts
type Err = { path?: string; message: string; code?: string };

export function formatErrors(errors: Err[]) {
  return errors
    .map((e, i) => `${i + 1}. ${e.message}${e.path ? ` at ${e.path}` : ""}`)
    .join("\n");
}
```

---

### 3) Per-Field Parameter Validation (as-you-type)

Use `validateParameterValue` to check a single input against a `SchemaNode`.

```ts
type FieldUpdate = {
  schema: SchemaNode;
  value: unknown;
  config?: ParamCheckConfig;
};

export function validateField({
  schema,
  value,
  config,
}: FieldUpdate): ParamCheckResult {
  return validateParameterValue(schema, value, config);
}
```

Example:

```ts
const cfg: ParamCheckConfig = { unitAccepts: "both", mapAccepts: "both" };
const result = validateField({
  schema: paramSchemaNode,
  value: userValue,
  config: cfg,
});
if (!result.ok) {
  // show result.message next to the field
}
```

Good defaults:

```ts
export const DEFAULT_CHECK: ParamCheckConfig = {
  unitAccepts: "both",
  mapAccepts: "array-tuples",
};
```

---

### 4) Minimal React Hook for Param Forms

Simple controlled input with live validation.

```ts
import { useMemo, useState } from "react";
import { validateParameterValue } from "~/lib/params/paramChecker";
import type { SchemaNode } from "~/lib/AikenPlutusJsonSchema";

export function useParamField(schema: SchemaNode) {
  const [raw, setRaw] = useState<string>(""); // text box value
  const parsed = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    } // allow numbers/strings or JSON
  }, [raw]);

  const result = useMemo(
    () => validateParameterValue(schema, parsed),
    [schema, parsed],
  );

  return {
    raw,
    setRaw,
    parsedValue: parsed,
    isValid: result.ok,
    error: result.ok ? null : result.message,
  };
}
```

Usage:

```tsx
function ParamInput({ label, schema }: { label: string; schema: SchemaNode }) {
  const f = useParamField(schema);
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div>{label}</div>
      <input
        value={f.raw}
        onChange={(e) => f.setRaw(e.target.value)}
        placeholder='Enter value or JSON (e.g., "0xABCD", 42, {"k":1})'
      />
      {!f.isValid && <div style={{ color: "crimson" }}>{f.error}</div>}
    </label>
  );
}
```

---

### 5) Handling `unit`, `map`, and `anyOf` edge cases

#### Unit acceptance

```ts
// Accept both null and {} for unit
validateParameterValue(schema, null, { unitAccepts: "both" });
validateParameterValue(schema, {}, { unitAccepts: "both" });
```

#### Map input shapes

```ts
// Accept map as array of [key, value] tuples (default)
validateParameterValue(mapSchema, [
  ["k1", 1],
  ["k2", 2],
]);

// Accept JS object instead
validateParameterValue(mapSchema, { k1: 1, k2: 2 }, { mapAccepts: "object" });

// Accept both
validateParameterValue(mapSchema, something, { mapAccepts: "both" });
```

#### `anyOf` (unions)

- Try the value against each alternative until one matches.
- If all fail, return a combined message.
- For UX, consider showing a short hint like: “Expected one of: constructor(0), bytes, integer…”

---

### 6) Walking a `SchemaNode` (build simple type-hints)

Useful to label fields (`list<int>`, `pair<bytes,int>`, `ref:#/definitions/Foo`, etc.).

```ts
export function typeHint(node: SchemaNode): string {
  if ("$ref" in node) return `ref:${node.$ref}`;
  if ("anyOf" in node) return `anyOf<${node.anyOf.map(typeHint).join(" | ")}>`;
  if ("dataType" in node) {
    switch (node.dataType) {
      case "integer":
        return "integer";
      case "bytes":
        return "bytes";
      case "string":
        return "string";
      case "boolean":
        return "boolean";
      case "unit":
        return "unit";
      case "list":
        return `list<${typeHint(node.items)}>`;
      case "map":
        return `map<${typeHint(node.keys)},${typeHint(node.values)}>`;
      case "pair":
        return `pair<${typeHint(node.fst)},${typeHint(node.snd)}>`;
      case "constructor":
        return `ctor#${node.index}(${(node.fields ?? []).map(typeHint).join(",")})`;
    }
  }
  return "opaque{}"; // empty object
}
```

---

### 7) Resolving `$ref` into definitions

If you expose a ref resolver (or add one), here’s the pattern:

```ts
import type { AikenBlueprint, SchemaNode } from "~/lib/AikenPlutusJsonSchema";

export function resolveRef(
  ref: string,
  definitions: NonNullable<AikenBlueprint["definitions"]>,
) {
  // "#/definitions/cardano~1assets~1AssetName" → "cardano/assets/AssetName"
  const m = /^#\/definitions\/(.+)$/.exec(ref);
  const key = m?.[1];
  return key ? definitions[key] : undefined;
}

export function inlineRefs(
  node: SchemaNode,
  defs: NonNullable<AikenBlueprint["definitions"]>,
): SchemaNode {
  if ("$ref" in node) {
    const resolved = resolveRef(node.$ref, defs);
    return resolved ? inlineRefs(resolved, defs) : node;
  }
  if ("anyOf" in node)
    return { ...node, anyOf: node.anyOf.map((n) => inlineRefs(n, defs)) };
  if ("dataType" in node) {
    switch (node.dataType) {
      case "list":
        return { ...node, items: inlineRefs(node.items, defs) };
      case "map":
        return {
          ...node,
          keys: inlineRefs(node.keys, defs),
          values: inlineRefs(node.values, defs),
        };
      case "pair":
        return {
          ...node,
          fst: inlineRefs(node.fst, defs),
          snd: inlineRefs(node.snd, defs),
        };
      case "constructor":
        return {
          ...node,
          fields: (node.fields ?? []).map((n) => inlineRefs(n, defs)),
        };
      default:
        return node;
    }
  }
  return node; // opaque {}
}
```

---

### 8) Guard rails before using a blueprint

When you don’t control the input, keep the checks cheap and early.

```ts
export function mustBeValidBlueprint(raw: unknown): AikenBlueprint {
  const v = validateAikenBlueprint(raw);
  if (!v.ok) {
    const msg = (v.errors ?? [])
      .map((e) => `${e.message}${e.path ? ` at ${e.path}` : ""}`)
      .join("; ");
    throw new Error(`Invalid blueprint: ${msg}`);
  }
  return v.data;
}
```

---

### 9) Parameter form scaffolding (from CIP-57)

Given a list of parameters (name + `SchemaNode`), render a small form.

```ts
type ParamSpec = { name: string; schema: SchemaNode };

export function renderParamSpecs(params: ParamSpec[]) {
  return params.map((p) => ({
    label: p.name,
    hint: typeHint(p.schema),
    // default value suggestion (optional)
    defaultValue: defaultFor(p.schema),
  }));
}

function defaultFor(node: SchemaNode): unknown {
  if ("dataType" in node) {
    switch (node.dataType) {
      case "integer":
        return 0;
      case "bytes":
        return "0x";
      case "string":
        return "";
      case "boolean":
        return false;
      case "unit":
        return null; // or {}
      case "list":
        return [];
      case "map":
        return []; // or {}
      case "pair":
        return [defaultFor(node.fst), defaultFor(node.snd)];
      case "constructor":
        return (node.fields ?? []).map(defaultFor);
    }
  }
  if ("$ref" in node) return undefined; // up to you; you can inline refs first
  if ("anyOf" in node) return defaultFor(node.anyOf[0]); // pick first alternative
  return {}; // opaque
}
```

---

### 10) Testing helpers (vitest)

Quick harness for fixtures.

```ts
import { describe, it, expect } from "vitest";
import { validateAikenBlueprint } from "~/lib/validatePlutusJson";

import dedog from "../fixtures/dedog.plutus.json";
import fail from "../fixtures/fail.plutus.json";

describe("Blueprint validation", () => {
  it("accepts a valid blueprint", () => {
    const v = validateAikenBlueprint(dedog);
    expect(v.ok).toBe(true);
  });

  it("rejects an invalid blueprint with readable errors", () => {
    const v = validateAikenBlueprint(fail);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      console.error(v.errors); // prefer user-friendly errors
      expect(v.errors.length).toBeGreaterThan(0);
    }
  });
});
```

---

### 11) Progressive enhancement strategy

- Start with `validateAikenBlueprint` at upload time.
- If valid, keep the raw JSON and the parsed structure side-by-side in state.
- Build param forms using each parameter’s `SchemaNode` + `validateParameterValue`.
- For any `$ref`, either:
  - Inline via a small resolver (see recipe 7), or
  - Display as-is with a tooltip `ref: #/definitions/XYZ` and validate the final resolved node when submitting.

---

### 12) UX tips

- Show a type-hint (`typeHint(schema)`) under each field.
- Debounce validation for large objects (e.g., 150–250ms).
- When `anyOf` fails, list the allowed variants in the error.
- For bytes, accept both `0x…` and raw hex; normalize before validate.

---

### 13) Extract per-purpose IO (datum/redeemer) from a ParsedJson

Given a parsed blueprint, get the datum and redeemer schema summaries for a validator + purpose.

```ts
import type { ParsedJson, PurposeName } from "~/lib/types";

/**
 * Returns the per-purpose IO (datum/redeemer) summaries if present.
 * Use these to render purpose-specific forms or tooltips.
 */
export function getPurposeIO(
  parsed: ParsedJson,
  validatorName: string,
  purpose: PurposeName,
):
  | {
      datum?: { schema: { typeHint: string } };
      redeemer?: { schema: { typeHint: string } };
    }
  | undefined {
  const v = parsed.validators[validatorName];
  if (!v) return undefined;
  const p = v.purposes?.[purpose];
  if (!p) return undefined;

  const pick = (io?: { schema: { typeHint: string } }) =>
    io ? { schema: { typeHint: io.schema.typeHint } } : undefined;

  return {
    datum: pick(p.datum),
    redeemer: pick(p.redeemer),
  };
}

// Example usage
function ioHints(parsed: ParsedJson, name: string, purpose: PurposeName) {
  const io = getPurposeIO(parsed, name, purpose);
  if (!io) return "No IO for that purpose.";
  const d = io.datum?.schema.typeHint ?? "—";
  const r = io.redeemer?.schema.typeHint ?? "—";
  return `Datum: ${d} | Redeemer: ${r}`;
}
```

> Tip: If you need the exact underlying `SchemaNode`, extend the return type to include `raw` (available on `SchemaSummary`) and wire it through your validation UI.
