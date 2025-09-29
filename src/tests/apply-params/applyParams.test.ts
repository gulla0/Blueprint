// src/tests/applyParams.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set up all mocks first
vi.mock("@meshsdk/core-csl", () => ({
  applyParamsToScript: vi.fn().mockReturnValue("mock-cbor"),
}));

vi.mock("@meshsdk/core", () => ({
  resolveScriptHash: vi.fn().mockReturnValue("mockhash123"),
  resolvePlutusScriptAddress: vi.fn().mockReturnValue("addr_test1qmockaddress000000000000000000000"),
}));

vi.mock("~/lib/params/paramChecker", () => ({
  validateParameterValue: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("~/lib/parse/parseAikenBlueprint", () => ({
  parseAikenBlueprint: vi.fn(),
}));

// Import everything after mocks
import {
  buildValidatorArtifactsFromParsed,
  buildValidatorArtifactsFromRaw,
  inferPurposeFromTitle,
} from "~/lib/params/applyParams";

import { applyParamsToScript } from "@meshsdk/core-csl";
import { resolvePlutusScriptAddress, resolveScriptHash } from "@meshsdk/core";
import { parseAikenBlueprint } from "~/lib/parse/parseAikenBlueprint";
import { validateParameterValue } from "~/lib/params/paramChecker";

// Get the mocks via vi.mocked
const parseBlueprintMock = vi.mocked(parseAikenBlueprint);
const validateParamMock = vi.mocked(validateParameterValue);

/* -----------------------------
   Test helpers & fixtures
----------------------------- */

// Minimal "parsed blueprint" shape we need for tests
const basePreamble = { plutusVersion: "v3" };

// Simple param schemas
const intParam = { title: "count", $ref: "#/definitions/Int" };
const bytesParam = {
  title: "key",
  $ref: "#/definitions/cardano~1crypto~1Ed25519KeyHash",
};

function makeParsedBlueprint(validators: any[]) {
  return {
    preamble: basePreamble,
    validators,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateParamMock.mockReturnValue({ ok: true });
});

/* -----------------------------
   1) Helper: inferPurposeFromTitle
----------------------------- */

describe("inferPurposeFromTitle", () => {
  it("identifies spend", () => {
    expect(inferPurposeFromTitle("mod.val[spend]")).toBe("spend");
  });

  it("identifies mint", () => {
    expect(inferPurposeFromTitle("mod.val[mint]")).toBe("mint");
  });

  it("returns unknown when suffix missing", () => {
    expect(inferPurposeFromTitle("mod.val")).toBe("unknown");
  });
});

/* -----------------------------
   2) buildValidatorArtifactsFromParsed
----------------------------- */

describe("buildValidatorArtifactsFromParsed", () => {
  it("paramless SPEND: skips apply, returns original CBOR, computes hash and address", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_ORIGINAL_ABC",
        // no parameters
      },
    ]);

    const res = buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0 /* preprod */);

    // No baking
    expect(applyParamsToScript).not.toHaveBeenCalled();

    // Returned CBOR is the original
    expect(res.scriptCbor).toBe("CBOR_ORIGINAL_ABC");

    // Hash & Address computed
    expect(resolveScriptHash).toHaveBeenCalledTimes(1);
    expect(res.scriptHash).toBe("mockhash123");

    expect(resolvePlutusScriptAddress).toHaveBeenCalledTimes(1);
    expect(res.scriptAddress).toMatch(/^addr_test1qmock/);

    // Purpose
    expect(res.purpose).toBe("spend");
  });

  it("paramless MINT: skips apply, returns original CBOR, computes hash, NO address", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[mint]",
        compiledCode: "CBOR_ORIGINAL_MINT",
      },
    ]);

    const res = buildValidatorArtifactsFromParsed(parsed, "mod.val[mint]", 0);

    // No baking
    expect(applyParamsToScript).not.toHaveBeenCalled();

    // Returned CBOR is the original
    expect(res.scriptCbor).toBe("CBOR_ORIGINAL_MINT");

    // Hash computed
    expect(resolveScriptHash).toHaveBeenCalledTimes(1);
    expect(res.scriptHash).toBe("mockhash123");

    // Address must be undefined for mint
    expect(resolvePlutusScriptAddress).not.toHaveBeenCalled();
    expect(res.scriptAddress).toBeUndefined();

    expect(res.purpose).toBe("mint");
  });

  it("WITH params (array inputs): validates & wraps to CIP-57 then bakes", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_BEFORE",
        parameters: [intParam, bytesParam],
      },
    ]);

    // Provide array inputs in schema order: [count:int, key:bytes]
    const res = buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0, [
      123,
      "0xdeadbeef",
    ]);

    // Validate called for each param
    expect(validateParamMock).toHaveBeenCalledTimes(2);

    // applyParamsToScript called with CIP-57 wrapped values
    expect(applyParamsToScript).toHaveBeenCalledTimes(1);
    const [passedCbor, passedParams, mode] = (applyParamsToScript as any).mock.calls[0];
    expect(passedCbor).toBe("CBOR_BEFORE");
    expect(mode).toBe("JSON");
    expect(passedParams).toEqual([{ int: "123" }, { bytes: "deadbeef" }]);

    // Output is from our mock
    expect(res.scriptCbor).toBe("mock-cbor");
    expect(res.scriptHash).toBe("mockhash123");
    expect(res.scriptAddress).toMatch(/^addr_test1qmock/);
    expect(res.purpose).toBe("spend");
  });

  it("WITH params (object inputs): maps by schema titles in order, then bakes", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_BEFORE",
        parameters: [intParam, bytesParam], // order: count, key
      },
    ]);

    const res = buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0, {
      key: "deadbeef", // bytes string (no 0x)
      count: 6000, // int
    });

    // apply called with ordered CIP-57: [{int:"6000"}, {bytes:"deadbeef"}]
    const [, passedParams] = (applyParamsToScript as any).mock.calls[0];
    expect(passedParams).toEqual([{ int: "6000" }, { bytes: "deadbeef" }]);

    expect(res.scriptCbor).toBe("mock-cbor");
    expect(res.scriptHash).toBe("mockhash123");
    expect(res.scriptAddress).toMatch(/^addr_test1qmock/);
  });

  it("ARRAY inputs: wrong param count throws", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_BEFORE",
        parameters: [intParam, bytesParam],
      },
    ]);

    expect(() =>
      buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0, [123 /* missing second */])
    ).toThrow(/Expected 2 params, received 1/);
  });

  it("OBJECT inputs: missing key throws", () => {
    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_BEFORE",
        parameters: [intParam, bytesParam], // needs count + key
      },
    ]);

    expect(() =>
      buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0, { count: 1 /* no key */ })
    ).toThrow(/Missing parameter "key"/);
  });

  it("Invalid param value: bubbles up validator error", () => {
    validateParamMock.mockReturnValueOnce({ ok: false, message: "not an int" });

    const parsed = makeParsedBlueprint([
      {
        title: "mod.val[spend]",
        compiledCode: "CBOR_BEFORE",
        parameters: [intParam],
      },
    ]);

    expect(() =>
      buildValidatorArtifactsFromParsed(parsed, "mod.val[spend]", 0, [ "NaN?" ])
    ).toThrow(/Param #1 invalid: not an int/);
  });
});

/* -----------------------------
   3) buildValidatorArtifactsFromRaw
----------------------------- */

describe("buildValidatorArtifactsFromRaw", () => {
  it("throws when parseAikenBlueprint returns a validation failure", () => {
    // Mock a validation failure result
    parseBlueprintMock.mockReturnValueOnce({ 
      ok: false, 
      message: "bad blueprint" 
    } as any);

    expect(() =>
      buildValidatorArtifactsFromRaw({ some: "raw" }, "mod.val[spend]", 0, null)
    ).toThrow(/Invalid Aiken blueprint: bad blueprint/);
  });

  it("delegates to ...FromParsed when parse is successful", () => {
    // ✅ Use the same array shape as your other tests
    const parsed = makeParsedBlueprint([
      { title: "mod.val[spend]", compiledCode: "CBOR_ORIGINAL", parameters: [] },
    ]);
  
    parseBlueprintMock.mockReturnValueOnce(parsed as any);
  
    const res = buildValidatorArtifactsFromRaw({ any: "thing" }, "mod.val[spend]", 0, null);
  
    // Since paramless+no inputs → no baking
    expect(applyParamsToScript).not.toHaveBeenCalled();
    expect(res.scriptCbor).toBe("CBOR_ORIGINAL");
    expect(res.scriptHash).toBe("mockhash123");
    expect(res.scriptAddress).toMatch(/^addr_test1qmock/);
  });
});