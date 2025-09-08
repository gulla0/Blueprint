// src/lib/cip57/types.ts
import type { Network } from "@meshsdk/core";

/**
 * Re-export CIP-57 types inferred from the runtime Zod schemas.
 * Single source of truth = schema.ts
 */
export type {
  Cip57Blueprint,
  Cip57Validator,
  Cip57Arg,
  Cip57Schema,
  Cip57Purpose,
  Cip57DataType,
} from "./schema";

/**
 * Plutus versions
 * Accept many notations; normalize elsewhere to "V1" | "V2" | "V3".
 */
export type PlutusVersionNorm = "V1" | "V2" | "V3";
export type PlutusVersionBlueprint = "v1" | "v2" | "v3" | string;
export type PlutusVersionWire = "PlutusV1" | "PlutusV2" | "PlutusV3" | string;

/**
 * Normalized views used by your app
 */
export type NormalizedValidator = import("./schema").Cip57Validator & {
  name: string;                               // from object key or title
  purposes: import("./schema").Cip57Purpose[]; // include "publish" if present
};

/**
 * Artifact container for later stages of your pipeline
 */
export interface ScriptArtifacts {
  version: PlutusVersionNorm;
  plutusScript: { code: string; version: PlutusVersionNorm };
  scriptCbor: string;     // hex (double-CBOR UPLC)
  scriptHash: string;     // hex (blake2b-224)
  scriptAddress: string;  // bech32
}

/**
 * Build options passed to your artifact builder
 */
export interface BuildOptions {
  network: Network;               // "testnet" | "preview" | "preprod" | "mainnet" (per Mesh)
  stakeKeyHashHex?: string | null;
  isScriptStakeCredential?: boolean; // optional, default false
  forceComputeHash?: boolean;
}