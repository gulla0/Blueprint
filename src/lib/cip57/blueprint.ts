// CIP-57 parser + artifact builder (spend|mint|withdraw only).
// Works in browser or API route. Recomputing script hash requires CSL in Node.
//
// Deps:
//   npm i @meshsdk/core @meshsdk/core-csl
//   # optional (for hash recompute):
//   npm i @emurgo/cardano-serialization-lib-nodejs

import { serializePlutusScript } from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import { networkToId } from "./utils";
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
} from "./utils";

export class Blueprint57 {
  private bp: Cip57Blueprint;
  private defaultPlutus: PlutusVersionNorm;

  constructor(blueprintJson: unknown) {
    if (!blueprintJson || typeof blueprintJson !== "object" || !("validators" in (blueprintJson as any))) {
      throw new Error("Invalid blueprint: missing `validators`");
    }
    this.bp = blueprintJson as Cip57Blueprint;
    this.defaultPlutus = normalizePlutusVersion(this.bp.preamble?.plutusVersion);
  }

  listValidators(): NormalizedValidator[] {
    return normalizeValidators(this.bp.validators);
  }

  byPurpose(purpose: "spend" | "mint" | "withdraw"): NormalizedValidator[] {
    return this.listValidators().filter(v => v.purposes.includes(purpose));
  }

  requiresParameters(v: NormalizedValidator): boolean {
    return Array.isArray(v.parameters) && v.parameters.length > 0;
  }

  async buildArtifacts(
    validatorNameOrTitle: string,
    options: BuildOptions,
    appliedParams?: unknown[]
  ): Promise<ScriptArtifacts> {
    const v = pickValidatorByNameOrTitle(this.listValidators(), validatorNameOrTitle);
    if (!v) throw new Error(`Validator not found: ${validatorNameOrTitle}`);

    const version = normalizePlutusVersion(v.plutusVersion ?? this.bp.preamble?.plutusVersion ?? "PlutusV3");
    const needsParams = this.requiresParameters(v);
    const hasCompiled = !!v.compiledCode?.length;

    if (needsParams && (!appliedParams || !Array.isArray(appliedParams))) {
      throw new Error(`Validator "${v.title}" requires parameters; provide 'appliedParams' as an ordered array`);
    }

    let scriptCbor = "";
    if (needsParams) {
      scriptCbor = applyParamsToScript(
        v.compiledCode ?? "",
        appliedParams as object[]?? [],
      );
    } else if (hasCompiled) {
      scriptCbor = v.compiledCode!;
    } else {
      throw new Error(`Validator "${v.title}" has no compiledCode and no parameters — cannot build`);
    }

    const plutusScript: PlutusScript = { code: scriptCbor, version };

    const { address } = serializePlutusScript(
        plutusScript,
        options.stakeKeyHashHex ?? undefined,
        networkToId(options.network),
        options.isScriptStakeCredential ?? false   // ✅ configurable, default false
      );

    const scriptAddress = address;

    const scriptHash =
      !options.forceComputeHash && v.hash
        ? v.hash
        : await this.computeScriptHashFromCbor(scriptCbor);

    return { version, plutusScript, scriptCbor, scriptHash, scriptAddress };
  }

  // Hash recompute via CSL (Node/API route)
  private async computeScriptHashFromCbor(
    scriptCborHex: string,
    // version param can be dropped if not needed elsewhere
  ): Promise<string> {
    try {
      const CSL: typeof import("@emurgo/cardano-serialization-lib-nodejs") =
        // @ts-ignore dynamic import
        await import("@emurgo/cardano-serialization-lib-nodejs");
  
      const bytes = fromHex(scriptCborHex);
      const ps = CSL.PlutusScript.from_bytes(bytes);
      const scriptHash = ps.hash();
      return toHex(scriptHash.to_bytes());
    } catch {
      throw new Error(
        "Script-hash computation requires @emurgo/cardano-serialization-lib-nodejs (run in API route) or set forceComputeHash=false to trust blueprint hash"
      );
    }
  }
}