/**
 * Function under test: toHex(bytes: Uint8Array) => string
 * Purpose: Convert bytes into a lowercase hex string, zero-padded.
 * This suite ensures stable formatting (e.g., 0 -> "00", 255 -> "ff").
 */

import { describe, it, expect } from "vitest";
import { toHex } from "~/lib/cip57/utils";

describe("toHex", () => {
  it("encodes bytes to zero-padded lowercase hex", () => {
    const u8 = new Uint8Array([0, 1, 255]);
    expect(toHex(u8)).toBe("0001ff");
  });
});