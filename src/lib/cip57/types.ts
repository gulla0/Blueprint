import type { Network } from "@meshsdk/core";

// ----- Purposes (add "publish")
export type Cip57Purpose = "spend" | "mint" | "withdraw" | "publish";

// ----- Plutus versions (accept many, normalize to V1/V2/V3)
export type PlutusVersionNorm = "V1" | "V2" | "V3";
export type PlutusVersionBlueprint = "v1" | "v2" | "v3" | string;
export type PlutusVersionWire = "PlutusV1" | "PlutusV2" | "PlutusV3" | string;

// ----- CIP-57 Schema (broaden applicators)
export type Cip57Schema =
  | { dataType?: string; [k: string]: unknown }
  | { $ref: string }
  | { oneOf: Cip57Schema[] }
  | { anyOf: Cip57Schema[] }
  | { allOf: Cip57Schema[] }
  | { not: Cip57Schema };

// ----- Arg (purpose can be string or a oneOf of purposes)
export interface Cip57Arg {
  title?: string;
  description?: string;
  purpose?: Cip57Purpose | { oneOf: Cip57Purpose[] };
  schema: Cip57Schema | { oneOf: Cip57Schema[] };
}

// ----- Validator (make redeemer required; enforce code/hash pairing)
interface Cip57ValidatorBase {
  title: string;
  description?: string;
  redeemer: Cip57Arg | { oneOf: Cip57Arg[] }; // prefer required
  datum?: Cip57Arg | { oneOf: Cip57Arg[] };
  parameters?: (Cip57Arg | { oneOf: Cip57Arg[] })[];
  // Non-standard but seen: allow per-validator override, else use preamble.plutusVersion
  plutusVersion?: PlutusVersionWire | PlutusVersionBlueprint | string;
}

// If compiledCode is present, hash must be present.
export type Cip57Validator =
  | (Cip57ValidatorBase & { compiledCode?: undefined; hash?: undefined })
  | (Cip57ValidatorBase & { compiledCode: string; hash: string });

export interface Cip57Blueprint {
  preamble?: {
    title?: string;
    description?: string;
    version?: string;
    compiler?: { name: string; version?: string };
    plutusVersion?: PlutusVersionBlueprint | PlutusVersionWire | string;
    license?: string;
  };
  // Spec says object; Aiken emits array -> support both
  validators: Record<string, Cip57Validator> | Cip57Validator[];
  definitions?: Record<string, unknown>;
}

// ----- Normalized views
export type NormalizedValidator = Cip57Validator & {
  name: string;                   // from object key or title
  purposes: Cip57Purpose[];       // include "publish" if present
};

export interface ScriptArtifacts {
  version: PlutusVersionNorm;
  plutusScript: { code: string; version: PlutusVersionNorm };
  scriptCbor: string;     // hex (double-CBOR UPLC)
  scriptHash: string;     // hex (blake2b-224)
  scriptAddress: string;  // bech32
}

// ----- Build options (values match Mesh docs)
export interface BuildOptions {
  network: Network;               // "testnet" | "preview" | "preprod" | "mainnet"
  stakeKeyHashHex?: string | null;
  isScriptStakeCredential?: boolean; // optional, default false
  forceComputeHash?: boolean;
}