// CIP-57 parser + artifact builder (spend|mint|withdraw API surface).
// Internally we also tolerate `publish` so valid blueprints won’t choke.
//
// Deps:
//   npm i @meshsdk/core @meshsdk/core-csl
//   # optional (for hash recompute in Node/API route):
//   npm i @emurgo/cardano-serialization-lib-nodejs

import { serializePlutusScript } from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import type { PlutusScript } from "@meshsdk/core";

import type {
  BuildOptions,
  Cip57Blueprint,
  NormalizedValidator,
  PlutusVersionNorm,
  ScriptArtifacts,
} from "./types";

import {
  fromHex,
  toHex,
  normalizePlutusVersion,
  normalizeValidators,
  pickValidatorByNameOrTitle,
  networkToId,
} from "./utils";

export class Blueprint57 {
  private bp: Cip57Blueprint;
  private defaultPlutus: PlutusVersionNorm;

  constructor(blueprintJson: unknown) {
    if (
      !blueprintJson ||
      typeof blueprintJson !== "object" ||
      !("validators" in (blueprintJson as Record<string, unknown>))
    ) {
      throw new Error("Invalid blueprint: missing `validators`");
    }

    this.bp = blueprintJson as Cip57Blueprint;
    // Accept "v3" | "PlutusV3" | "V3" etc.; default to V3 if absent.
    this.defaultPlutus =
      normalizePlutusVersion(this.bp.preamble?.plutusVersion) ?? "V3";
  }

  /** Return validators normalized to a consistent list with inferred purposes and names. */
  listValidators(): NormalizedValidator[] {
    return normalizeValidators(this.bp.validators);
  }

  /** Public API intentionally narrowed to spend|mint|withdraw (you can widen later). */
  byPurpose(purpose: "spend" | "mint" | "withdraw"): NormalizedValidator[] {
    return this.listValidators().filter((v) => v.purposes.includes(purpose));
  }

  /** True when validator has parameter schemas (requires `appliedParams`). */
  requiresParameters(v: NormalizedValidator): boolean {
    return Array.isArray(v.parameters) && v.parameters.length > 0;
  }

  /**
   * Build script artifacts for a validator (optionally applying parameters).
   * - Validates presence/ordering of parameters.
   * - Normalizes Plutus version and preserves it for address/hash.
   * - Derives address with Mesh; optionally recomputes script hash via CSL.
   */
  async buildArtifacts(
    validatorNameOrTitle: string,
    options: BuildOptions,
    appliedParams?: unknown[]
  ): Promise<ScriptArtifacts> {
    const v = pickValidatorByNameOrTitle(
      this.listValidators(),
      validatorNameOrTitle
    );
    if (!v) throw new Error(`Validator not found: ${validatorNameOrTitle}`);

    // Normalize version from validator -> preamble -> class default.
    const version =
      normalizePlutusVersion(
        v.plutusVersion ?? this.bp.preamble?.plutusVersion
      ) ?? this.defaultPlutus;

    const needsParams = this.requiresParameters(v);
    const hasCompiled = typeof v.compiledCode === "string" && v.compiledCode.length > 0;

    if (needsParams) {
      if (!appliedParams || !Array.isArray(appliedParams)) {
        throw new Error(
          `Validator "${v.title}" requires parameters; provide 'appliedParams' as an ordered array`
        );
      }
      if (!hasCompiled) {
        throw new Error(
          `Validator "${v.title}" is parameterized but missing compiledCode`
        );
      }
    } else if (!hasCompiled) {
      throw new Error(
        `Validator "${v.title}" has no compiledCode and no parameters — cannot build`
      );
    }

    // Build/prepare the double-CBOR UPLC bytes (hex) for the script.
    let scriptCbor = "";
    if (needsParams) {
      const params = (appliedParams ?? []) as object[];
      scriptCbor = applyParamsToScript(v.compiledCode as string, params);
    } else {
      scriptCbor = v.compiledCode as string;
    }

    // Mesh expects the versioned form when producing addresses.
    const plutusScript: PlutusScript = { code: scriptCbor, version };

    // Produce the script address (bech32).
    const { address } = serializePlutusScript(
      plutusScript,
      options.stakeKeyHashHex ?? undefined,
      networkToId(options.network),
      options.isScriptStakeCredential ?? false
    );
    const scriptAddress = address;

    // Prefer blueprint hash unless recompute is forced.
    // Recompute path must respect version — it changes the hash.
    const scriptHash =
      !options.forceComputeHash && v.hash
        ? v.hash
        : await this.computeScriptHashFromCbor(scriptCbor, version);

    return { version, plutusScript, scriptCbor, scriptHash, scriptAddress };
  }

  // Recompute script hash with CSL (run only in Node/API routes).
  // Version is required because the language tag contributes to the hash.
  private async computeScriptHashFromCbor(
    scriptCborHex: string,
    version: PlutusVersionNorm
  ): Promise<string> {
    try {
      const CSL: typeof import("@emurgo/cardano-serialization-lib-nodejs") =
        await import("@emurgo/cardano-serialization-lib-nodejs");

      const programBytes = fromHex(scriptCborHex);

      // Prefer versioned constructors if available; otherwise fall back.
      let ps: any;
      const ctor: any = (CSL.PlutusScript as unknown) as Record<string, unknown>;
      if (typeof ctor["new_v1"] === "function") {
        if (version === "V1") {
          ps = (CSL.PlutusScript as any).new_v1(programBytes);
        } else if (version === "V2") {
          ps = (CSL.PlutusScript as any).new_v2(programBytes);
        } else {
          ps = (CSL.PlutusScript as any).new_v3(programBytes);
        }
      } else {
        // Older CSL builds accept the already-wrapped bytes.
        ps = CSL.PlutusScript.from_bytes(programBytes);
      }

      const scriptHash = ps.hash();
      return toHex(scriptHash.to_bytes());
    } catch {
      throw new Error(
        "Script-hash computation requires @emurgo/cardano-serialization-lib-nodejs (run in an API route) or set forceComputeHash=false to trust the blueprint hash"
      );
    }
  }
}