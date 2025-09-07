/**
 * Function under test: fromHex(hex: string) => Uint8Array
 * Purpose: Convert a hex string (optionally 0x-prefixed) into bytes.
 * Risks: odd-length hex, non-hex characters.
 * This suite ensures strict parsing + helpful errors.
 */

import { describe, it, expect } from "vitest";
import { fromHex } from "~/lib/cip57/utils";

describe("fromHex", () => {
  it("parses even-length hex into bytes", () => {
    // happy path: two bytes
    expect(Array.from(fromHex("0a0b"))).toEqual([0x0a, 0x0b]);
  });

  it("supports 0x prefix transparently", () => {
    // same bytes whether or not '0x' prefix is present
    expect(Array.from(fromHex("0xdeadbeef"))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("throws on odd length to catch incomplete byte", () => {
    // "abc" is 3 hex chars, i.e., not an integer number of bytes
    expect(() => fromHex("abc")).toThrow(/odd-length/i);
  });

  it("throws on any non-hex characters", () => {
    // 'z' is not a hex digit
    expect(() => fromHex("zz")).toThrow(/non-hex/i);
  });
});