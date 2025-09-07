/**
 * Method under test: Blueprint57#listValidators() => NormalizedValidator[]
 * Purpose: Confirm the class normalizes the blueprint validators into a consistent list
 *          (array or map input) and infers purposes.
 * Strategy: Use the real fixture JSON and mock external libs (Mesh/CSL)
 *           so we don't exercise network/crypto in a unit test.
 */

import { describe, it, expect, vi } from "vitest";

// Mock Mesh & CSL since listValidators doesn't need them, but keep a consistent mock setup
vi.mock("@meshsdk/core", () => ({
  serializePlutusScript: vi.fn((_ps, _stake, _netId, _isScriptStake) => ({
    address: "addr_test1qqqqqqqqqqqqqqqqqq",
  })),
}));
vi.mock("@meshsdk/core-csl", () => ({
  applyParamsToScript: vi.fn((code: string) => code),
}));

import { Blueprint57 } from "~/lib/cip57/blueprint";
// Put your example JSON at /fixtures/dedog.blueprint.json
import dedog from "../../fixtures/dedog.blueprint.json";

describe("Blueprint57.listValidators", () => {
  it("returns a normalized list with inferred purposes", () => {
    const bp = new Blueprint57(dedog);
    const vs = bp.listValidators();

    expect(vs.length).toBeGreaterThan(0);
    // We expect at least one spend validator in your example
    expect(vs.some((v) => v.purposes.includes("spend"))).toBe(true);
  });
});