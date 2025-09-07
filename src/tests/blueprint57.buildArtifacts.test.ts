/**
 * Method under test: Blueprint57#buildArtifacts(...)
 * Purpose: Build a versioned PlutusScript + address + script hash,
 *          optionally applying parameters and optionally recomputing the hash.
 * Strategy:
 *   - Mock Mesh address derivation and CSL hashing to keep unit tests deterministic.
 *   - Verify trusting blueprint hash (forceComputeHash=false).
 *   - Verify recomputing hash path (forceComputeHash=true) uses CSL.
 *   - Verify parameter requirement enforcement.
 */

import { describe, it, expect, vi } from "vitest";

// Mesh mock: only address derivation used here
vi.mock("@meshsdk/core", async () => {
  return {
    serializePlutusScript: vi.fn((_ps: any, _stake: any, _net: any) => ({
      address: "addr_test1_mocked_address",
    })),
  };
});

// Mesh CSL helper mock: params application (we passthrough for simplicity)
vi.mock("@meshsdk/core-csl", async () => {
  return {
    applyParamsToScript: vi.fn((code: string) => code),
  };
});

// CSL mock: used only when forceComputeHash=true
vi.mock("@emurgo/cardano-serialization-lib-nodejs", async () => {
  return {
    default: {
      PlutusScript: {
        // We only need V3 for the sample, but you could add v1/v2 if desired
        new_v3: (_b: Uint8Array) => ({
          hash: () => ({ to_bytes: () => new Uint8Array([0xaa, 0xbb, 0xcc]) }),
        }),
        from_bytes: (_b: Uint8Array) => ({
          hash: () => ({ to_bytes: () => new Uint8Array([0x99, 0x99, 0x99]) }),
        }),
      },
    },
  };
});

import { Blueprint57 } from "~/lib/cip57/blueprint";
import dedog from "../../fixtures/dedog.blueprint.json";

describe("Blueprint57.buildArtifacts", () => {
  it("builds artifacts trusting the blueprint hash when not forced", async () => {
    const bp = new Blueprint57(dedog);
    const target = bp.byPurpose("spend")[0]?.title;

    const art = await bp.buildArtifacts(
      target!,
      {
        network: "preview",
        isScriptStakeCredential: false,
        forceComputeHash: false, // use the hash from the blueprint when available
      },
      ["a1".repeat(28), "ff"] // policyId (28 bytes), assetName (1 byte)
    );

    expect(art.scriptAddress).toMatch(/^addr_/);    // address comes from mocked Mesh
    expect(art.scriptHash).toMatch(/^[0-9a-f]{56}$/); // blueprint hash format
    expect(art.version).toBe("V3");                // normalized from "v3"
  });

  it("recomputes hash via CSL when forced", async () => {
    const bp = new Blueprint57(dedog);
    const target = bp.byPurpose("spend")[0]?.title;

    const art = await bp.buildArtifacts(
      target!,
      {
        network: "preview",
        isScriptStakeCredential: false,
        forceComputeHash: true, // triggers CSL hashing path
      },
      ["a1".repeat(28), "ff"]
    );

    // From our CSL mock: [0xaa,0xbb,0xcc] -> "aabbcc"
    expect(art.scriptHash).toBe("aabbcc");
  });

  it("throws a clear error if params are required but omitted", async () => {
    const bp = new Blueprint57(dedog);
    const target = bp.byPurpose("spend")[0]?.title;

    await expect(
      bp.buildArtifacts(target!, {
        network: "preview",
        isScriptStakeCredential: false,
        forceComputeHash: false,
      })
    ).rejects.toThrow(/requires parameters/i);
  });
});