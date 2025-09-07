/**
 * Method under test: Blueprint57#byPurpose(purpose) => NormalizedValidator[]
 * Purpose: Filter normalized validators by the given purpose (spend|mint|withdraw).
 * Strategy: Use fixture; ensure only matched items are returned.
 */

import { describe, it, expect, vi } from "vitest";
vi.mock("@meshsdk/core", () => ({
  serializePlutusScript: vi.fn((_ps, _stake, _netId, _isScriptStake) => ({
    address: "addr_test1qqqqqqqqqqqqqqqqqq",
  })),
}));
vi.mock("@meshsdk/core-csl", () => ({
  applyParamsToScript: vi.fn((code: string) => code),
}));

import { Blueprint57 } from "~/lib/cip57/blueprint";
import dedog from "../../fixtures/dedog.blueprint.json";

describe("Blueprint57.byPurpose", () => {
  it("returns only validators that include the specified purpose", () => {
    const bp = new Blueprint57(dedog);
    const spends = bp.byPurpose("spend");

    expect(spends.length).toBeGreaterThan(0);
    expect(spends.every((v) => v.purposes.includes("spend"))).toBe(true);
  });
});