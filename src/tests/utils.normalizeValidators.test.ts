/**
 * Function under test: normalizeValidators(raw) => NormalizedValidator[]
 * Purpose: Accept either array or map input and produce a uniform list.
 *          Each item gets a stable 'name' and inferred 'purposes'.
 * This suite ensures both shapes are supported and 'name' is assigned correctly.
 */

import { describe, it, expect } from "vitest";
import { normalizeValidators } from "~/lib/cip57/utils";
import type { Cip57Validator } from "~/lib/cip57/types";

describe("normalizeValidators", () => {
  it("supports array input, using validator.title as the 'name'", () => {
    const arr: Cip57Validator[] = [{ title: "a.b.spend", redeemer: { schema: {} } }];
    const out = normalizeValidators(arr);
    expect(out[0]?.name).toBe("a.b.spend");
    expect(out[0]?.purposes).toEqual(["spend"]);
  });

  it("supports map input, using the map key as the 'name'", () => {
    const map = {
      foo: { title: "ignored.spend", redeemer: { schema: {} } },
    } satisfies Record<string, Cip57Validator>;
    const out = normalizeValidators(map);
    expect(out[0]?.name).toBe("foo");
    expect(out[0]?.purposes).toEqual(["spend"]);
  });
});