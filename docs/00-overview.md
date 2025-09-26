# Blueprint Library Overview

This project provides a set of TypeScript utilities, types, and helpers for
working with **Aiken blueprints** (`plutus.json`) and Cardano validator logic.
It is meant to be lightweight, composable, and developer-friendly.

## What’s inside

- **Features** (`10-features.md`)  
  High-level functions for parsing and validating Aiken outputs.

- **Core** (`20-core.md`)  
  Low-level helpers (parameter checks, schema resolution) that power the features.

- **Types** (`30-types.md`)  
  Shared domain types (Blueprints, SchemaNodes, Params, etc.).

- **Cookbook** (`90-cookbook.md`)  
  Examples and copy-paste recipes showing how to use the library in practice.

## Usage

At a high level, you will:

1. **Import high-level functions** for common tasks:

   ```ts
   import { validateAikenBlueprint } from "~/lib/validatePlutusJson";
   import { parseAikenBlueprint } from "~/lib/parse/parseAikenBlueprint";
   ```

2. Dive into core helpers when you need fine-grained control:

   ```ts
   import { validateParameterValue } from "~/lib/params/paramChecker";
   ```

3. Reference types when building your own flows:

   ```ts
   import type {
     AikenBlueprint,
     SchemaNode,
   } from "~/lib/AikenPlutusJsonSchema";
   ```

⸻

➡️ Next: 10-features.md — see the high-level functions first.
