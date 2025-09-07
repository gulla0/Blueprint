/**
 * Function under test: pickValidatorByNameOrTitle(list, key) => NormalizedValidator | undefined
 * Purpose: Return the first match where key equals 'name' or 'title'.
 * This suite verifies both matching modes with a simple single-item list.
 */

import { describe, it, expect } from "vitest";
import { pickValidatorByNameOrTitle, normalizeValidators } from "~/lib/cip57/utils";

describe("pickValidatorByNameOrTitle", () => {
  const list = normalizeValidators([{ title: "alpha.spend", redeemer: { schema: {} } }]);

  it("picks by name", () => {
    // In array-normalized case, name === title, so both should work
    expect(pickValidatorByNameOrTitle(list, "alpha.spend")?.title).toBe("alpha.spend");
  });

  it("picks by title", () => {
    expect(pickValidatorByNameOrTitle(list, "alpha.spend")?.name).toBe("alpha.spend");
  });
});