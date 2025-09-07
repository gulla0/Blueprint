/**
 * Method under test: Blueprint57#requiresParameters(v) => boolean
 * Purpose: Tell whether a validator needs parameters (i.e., has non-empty parameters array).
 * Strategy: Pick a validator from the fixture that has parameters and verify true.
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

describe("Blueprint57.requiresParameters", () => {
  it("returns true when parameters are present", () => {
    const bp = new Blueprint57(dedog);
    const v = bp.listValidators().find((x) => x.title.includes("noob_v2"));
    expect(v).toBeTruthy();
    expect(bp.requiresParameters(v!)).toBe(true);
  });
});