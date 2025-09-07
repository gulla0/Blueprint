/**
 * Function under test: networkToId(net: Network) => 0 | 1
 * Purpose: Convert a Mesh network name to cardano networkId byte.
 * Rule: mainnet -> 1, everything else -> 0.
 * This suite verifies the mapping for all supported values.
 */

import { describe, it, expect } from "vitest";
import { networkToId } from "~/lib/cip57/utils";

describe("networkToId", () => {
  it("maps mainnet to 1", () => expect(networkToId("mainnet")).toBe(1));

  it.each(["preprod", "preview", "testnet"] as const)(
    "maps %s to 0",
    (n) => expect(networkToId(n)).toBe(0)
  );
});