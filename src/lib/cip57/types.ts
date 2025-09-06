// CIP-57 type surface (tolerant) + normalized shapes.
// Purposes are limited to spend|mint|withdraw for now.
import type { Network } from "@meshsdk/core";

export type Cip57Purpose = "spend" | "mint" | "withdraw";

export type PlutusVersionNorm = "V1" | "V2" | "V3";

export type Cip57Schema =
  | { dataType?: string; [k: string]: unknown }
  | { oneOf: Cip57Schema[] }
  | { $ref?: string; [k: string]: unknown };

export interface Cip57Arg {
  title?: string;
  description?: string;
  purpose?: Cip57Purpose | { oneOf: Cip57Purpose[] };
  schema: Cip57Schema | { oneOf: Cip57Schema[] };
}

export interface Cip57Validator {
  title: string;
  description?: string;
  compiledCode?: string; // hex (double-CBOR UPLC)
  hash?: string;         // blake2b-224 hex
  redeemer?: Cip57Arg | { oneOf: Cip57Arg[] };
  datum?: Cip57Arg | { oneOf: Cip57Arg[] };
  parameters?: (Cip57Arg | { oneOf: Cip57Arg[] })[];
  plutusVersion?: "PlutusV1" | "PlutusV2" | "PlutusV3" | string;
}

export interface Cip57Blueprint {
  preamble?: {
    title?: string;
    description?: string;
    version?: string;
    compiler?: { name: string; version?: string };
    plutusVersion?: "PlutusV1" | "PlutusV2" | "PlutusV3" | string;
    license?: string;
  };
  validators:
    | Record<string, Cip57Validator>
    | Cip57Validator[]
    | { validators: Cip57Validator[] };
  definitions?: Record<string, unknown>;
}

export type NormalizedValidator = Cip57Validator & {
  name: string;                 // from object key or title
  purposes: Cip57Purpose[];     // inferred from title/explicit (limited to 3)
};

export interface ScriptArtifacts {
  version: PlutusVersionNorm;
  plutusScript: { code: string; version: PlutusVersionNorm };
  scriptCbor: string;     // hex (double-CBOR UPLC)
  scriptHash: string;     // hex (blake2b-224)
  scriptAddress: string;  // bech32
}

export interface BuildOptions {
    network: Network;               // "testnet" | "preview" | "preprod" | "mainnet"
    stakeKeyHashHex?: string | null;
    isScriptStakeCredential?: boolean; // ✅ optional, default false
    forceComputeHash?: boolean;
  }