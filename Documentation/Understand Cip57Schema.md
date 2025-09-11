
### Big picture

# Cip57Schema

On a high level, Cip57Schema validates that all the correct data types are being used in the fields.
If there is an unknown field, it lets it pass.

## Key Features

1. Accepts JSON-Schema-style composition (allOf/anyOf/oneOf/not) and $ref
2. Uses a discriminant (dataType) to decide which type-specific keywords are allowed
3. Enforces cross-field rules (e.g., if dataType="constructor" then both index and fields are required)
4. Is permissive to unknown fields (.passthrough()), which mirrors extensibility/custom keywords often used in CIP-57 examples

⸻

### Line-by-line tour

1) Recursive shell

```ts
export const Cip57Schema: z.ZodType<any> = z.lazy(() => z.object({ ... }))
```

	•	What: z.lazy defers evaluation so the schema can reference itself (see items, keys/values, oneOf, etc.).
	•	CIP-57 tie-in: CIP-57 schemas are recursive (lists of T, map K→V, nested constructors). You need recursion to express that.

2) General metadata

```ts
dataType: Cip57DataTypeSchema.optional(),
title?: string, description?: string, $comment?: string
```

	•	What: Optional descriptive fields. dataType is the key discriminator (e.g., "bytes" | "integer" | "list" | "map" | "constructor" | "string" | "boolean" depending on your Cip57DataTypeSchema).
	•	CIP-57: CIP-57 uses dataType to say how to interpret a value as Plutus Data. Titles/comments aid humans and UIs.

3) Applicators (composition)

```ts
allOf?: Cip57Schema[], anyOf?: Cip57Schema[], oneOf?: Cip57Schema[], not?: Cip57Schema
```

	•	What: Standard JSON-Schema-style composition nodes; each element is itself a Cip57Schema.
	•	CIP-57: The CIP explicitly allows combining constraints (e.g., refine a bytes type by multiple rules, or pick one of several constructors). Composition is how you model unions (sum types) or layered constraints.

4) $ref

```ts
$ref?: string
```

	•	What: A reference to a named definition elsewhere (e.g., "#/$defs/PolicyId" or plain keys if you dereference yourself).
	•	CIP-57: Specs and examples use $ref to avoid repeating the same fragment (e.g., reusable types like PolicyId, AssetName). JSON Schema 2020-12 permits $ref with siblings; some tools warn, but it’s legal—your comment notes that.

5) Bytes-only keywords

```ts
enum?: z.array(zHexEven)
maxLength?: zNonNegIntLike
minLength?: zNonNegIntLike
```

	•	What: Constrain byte arrays by:
	•	enum: only these hex values are allowed.
	•	minLength/maxLength: measured in bytes (your comment clarifies that).
	•	zHexEven: your helper ensures valid, even-length hex (common guard for CBOR/Plutus byte strings).
	•	CIP-57: Bytes appear constantly (policy IDs, asset names, hashes). Limiting by size or a whitelist is normal. Lengths being in bytes (not hex chars) matches the underlying data semantics (Plutus ByteString is a sequence of bytes).

⚠️ Note
Some CIP-57 implementations also allow string length constraints. Your schema reserves minLength/maxLength for bytes only. That’s a deliberate design choice; if you plan to support string dataType with length constraints, you may want a separate branch (see “Gaps & suggestions” below).

6) Integer-only keywords

```ts
multipleOf?: zPosIntLike
maximum?: zIntLike
exclusiveMaximum?: zIntLike
minimum?: zIntLike
exclusiveMinimum?: zIntLike
```

	•	What: Standard numeric guards.
	•	CIP-57: Integers are Plutus Integer. Range checks and divisibility (multipleOf) are the usual way to bound them (e.g., non-negative, within protocol ranges, etc.).

7) List-only keywords

```ts
items?: Cip57Schema | Cip57Schema[]
maxItems?: zNonNegIntLike
minItems?: zNonNegIntLike
uniqueItems?: boolean
```

	•	What: JSON-Schema list semantics:
	•	items: schema for homogeneous lists,
	•	items: [s1, s2, ...] for tuple-like fixed positions,
	•	cardinalities and uniqueness.
	•	CIP-57: Plutus List<Data> is common. This lets you say “a list of bytes of length 28-32,” or “exactly 2 fields with shapes X and Y”.

8) Map-only keywords

```ts
keys?: Cip57Schema
values?: Cip57Schema
```

	•	What: Describe a map by the schema of its keys and values.
	•	CIP-57: Plutus Map<Data,Data>. In practice, keys are often bytes or integer, but this stays general and lets you enforce “keys are bytes of length 28” (e.g., policy IDs) or “values are constructors of shape …”.

9) Constructor-only keywords

```ts
index?: zNonNegIntLike
fields?: Cip57Schema[]
```

	•	What: A tagged constructor (Plutus Data constructor).
	•	index is the constructor tag (0-n)
	•	fields is the array of the constructor’s arguments.
	•	CIP-57: This is exactly how you encode sum types (ADTs) into Plutus Data. A value with dataType="constructor" must specify which constructor (index) and the schema for each argument (fields).

10) .passthrough()
	•	What: Unknown keywords are not rejected.
	•	CIP-57: Handy for forward-compat and custom hints (e.g., UI hints, domain tags) without breaking validation.

11) .superRefine(...) — the rule engine

This is where the cross-field logic lives. In English:

a) “Bytes keywords only when dataType="bytes"”

```ts
if ((enum || maxLength !== undefined || minLength !== undefined) && dt !== "bytes") { issue(...) }
```

	•	Why: Avoids nonsensical mixes like dataType="integer" with maxLength.
	•	CIP-57: Keeps schemas canonical and unambiguous: “length” here clearly refers to bytes, not characters.

b) “Integer keywords only when dataType="integer"”

```ts
if ((multipleOf/max/exclusiveMax/min/exclusiveMin present) && dt !== "integer") { issue(...) }
```

	•	Why: Guards correctness; you can’t apply numeric bounds to non-numeric data.
	•	CIP-57: Prevents subtle mistakes (e.g., someone copied a block and forgot to change dataType).

c) “List keywords only when dataType="list"”

```ts
if ((items/maxItems/minItems/uniqueItems present) && dt !== "list") { issue(...) }
```

	•	Why: Disallows list-only constraints on other shapes.
	•	CIP-57: Keeps a clean separation of concerns.

d) “Map keywords only when dataType="map"”

```ts
if ((keys/values present) && dt !== "map") { issue(...) }
```

	•	Why/CIP-57: Same rationale as above.

e) “Constructor must be complete (and exclusive)”

```ts
const hasIndex = obj.index !== undefined
const hasFields = obj.fields !== undefined

if (dt === "constructor") {
  if (!hasIndex || !hasFields) { issue('constructor requires both "index" and "fields"') }
} else if (hasIndex || hasFields) {
  issue('"index"/"fields" can only be used with dataType="constructor"')
}
```

	•	Why: A constructor with no tag or no fields is ill-formed; adding index/fields to non-constructors is also an error.
	•	CIP-57: Matches the on-chain encoding (constructor tag + list of args). Enforces sum-type hygiene.

⸻

### How this matches (and protects) CIP-57

Aligned:

	1.	Discriminated model via `dataType`
CIP-57’s core idea is: each node is one of the Plutus data shapes. Your schema uses `dataType` and then scopes keywords to the correct shape. That reduces ambiguity and catches common authoring errors early.

	2.	Sum types through constructors
CIP-57 uses “constructor index + fields” to represent ADTs. Your mandatory pairing of index and fields with `dataType="constructor"` is exactly right.

	3.	Recursive composition
Lists, maps, nested constructors, and unions are all possible and are supported via recursion, `items/keys/values`, and `oneOf|anyOf|allOf|not`.

	4.	Reusable definitions via `$ref`
Refs are the practical way to define Cardano-specific atoms like PolicyId or AssetName once and reuse them everywhere.

	5.	Tight byte-string handling
Hex validation (`zHexEven`) + min/max bytes + enums reflect how most Cardano fields are treated in practice (hashes, keys, policy IDs). Measuring lengths in bytes (not hex digits) is semantically correct.

#### Opinionated/intentional constraints (good, but be aware):

	- You’ve limited `enum`, `minLength`, and `maxLength` to bytes only. That’s a design choice. JSON Schema allows these for strings too, and some CIP-57 authors use string data with length checks (e.g., bounded ASCII labels). Your guard is stricter: it prevents accidental confusion between hex bytes and human text (a common gotcha), at the cost of not supporting string-length limits yet.
	- `$ref` with siblings is allowed by the `2020-12` spec, but some toolchains resolve `$ref` and ignore siblings. Your comment acknowledges this. If you later feed these into off-the-shelf JSON-Schema validators, just make sure they’re `2020-12` and you know how they treat siblings.

⸻

### Examples (sanity check)

✅ Valid: a PolicyId byte string (28 bytes)

```json
{
  "title": "PolicyId",
  "dataType": "bytes",
  "minLength": 28,
  "maxLength": 28
}
```

❌ Invalid: integer with maxLength

```json
{ "dataType": "integer", "maxLength": 10 }
```

Your superRefine will error: “bytes keywords … require dataType=‘bytes’”.

✅ Valid: homogeneous list of asset names (≤32 bytes)

```json
{
  "dataType": "list",
  "items": {
    "$ref": "#/$defs/AssetName"
  },
  "maxItems": 50
}
```

✅ Valid: constructor for Transfer(index 0) with fields

```json
{
  "dataType": "constructor",
  "index": 0,
  "fields": [
    { "$ref": "#/$defs/PolicyId" },
    { "$ref": "#/$defs/AssetName" },
    { "dataType": "integer", "minimum": 1 }
  ]
}
```

❌ Invalid: constructor missing fields

```json
{ "dataType": "constructor", "index": 2 }
```

You’ll get: “constructor requires both index and fields”.

⸻

### Gaps, edge cases, and practical suggestions
	1.	String support (optional):
If you plan to allow `dataType="string"`, consider adding a string branch with `minLength/maxLength` (measured in code points), and optionally a `pattern` (regex) or `contentEncoding/contentMediaType` hints. Right now, `minLength/maxLength` are “bytes-only”.

	2.	enum for other types:
JSON Schema permits enum on any type. You purposely scoped it to bytes (sensible for Cardano). If you ever need enum for integers or string literals, loosen that guard.

	3.	uniqueItems semantics:
For lists of complex Plutus Data, “uniqueness” depends on deep equality of the encoded form. That’s fine as a schema intent, but be clear that enforcement at runtime needs a canonical comparison (e.g., CBOR round-trip or deep structural compare).

	4.	Map keys realism:
Plutus maps are `Map<Data, Data>`. On-chain comparability of Data keys is well-defined, but off-chain JSON maps require keys to be strings. Your schema models keys/values as schemas (good). Just ensure your encoder/decoder layer preserves the exact key shape.

	5.	Constructor index ranges:
You already require a non-negative integer for index. If you know the tag space for a given ADT, you can add a maximum (e.g., ≤3 for a 4-way sum).

	6.	Validation messages:
They’re already clear. If this powers a UI, you might add path details (e.g., which property triggered the error) when validating nested schemas.

⸻

### TL;DR — Why these checks “make sense” for CIP-57
	- CIP-57 describes how to represent Plutus Data with schemas. Each node must be one of the core shapes; only the right constraints apply to each shape.
	- Your `.superRefine` rules codify that contract:
	- bytes constraints only on bytes,
	- integer constraints only on integers,
	- list/map/constructor constraints only where they belong,
	- constructors must be complete (tag + fields) and exclusive.
	- The recursive structure + composition + `$ref` is exactly how we capture ADTs, nested lists/maps, and reusable Cardano atoms in practice.