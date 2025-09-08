import type {
    Cip57Arg,
    Cip57Blueprint,
    Cip57Purpose,
    Cip57Validator,
    NormalizedValidator,
    PlutusVersionNorm,
  } from "./types";
  
  import type { Network } from "@meshsdk/core";
  import { Cip57BlueprintSchema } from "./schema";
  
  /* -------------------- Hex helpers -------------------- */
  
  export function fromHex(hex: string): Uint8Array {
    const s = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (s.length % 2 !== 0) throw new Error("fromHex: odd-length input");
    if (!/^[0-9a-fA-F]*$/.test(s)) throw new Error("fromHex: non-hex characters");
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  
  export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  
  /* -------------------- Plutus version normalization -------------------- */
  
  export function normalizePlutusVersion(x?: string): PlutusVersionNorm | undefined {
    if (!x) return undefined;
    const s = x.trim().toLowerCase();
    if (s === "v1" || s === "plutusv1") return "V1";
    if (s === "v2" || s === "plutusv2") return "V2";
    if (s === "v3" || s === "plutusv3") return "V3";
    return undefined; // fall back to preamble or error upstream
  }

  /* -------------------- Blueprint parsing -------------------- */

/**
 * Parse and validate a CIP-57 blueprint JSON.
 * Throws ZodError if validation fails.
 */
export function parseBlueprint(json: unknown): Cip57Blueprint {
    return Cip57BlueprintSchema.parse(json);
  }
  
  /**
   * Safe parse variant — returns a success flag instead of throwing.
   */
  export function safeParseBlueprint(json: unknown):
    | { success: true; data: Cip57Blueprint }
    | { success: false; error: string } {
    const result = Cip57BlueprintSchema.safeParse(json);
    if (result.success) return { success: true, data: result.data };
    return {
      success: false,
      error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  
  /* -------------------- Validator picking -------------------- */
  
  export function pickValidatorByNameOrTitle(
    all: NormalizedValidator[],
    key: string
  ): NormalizedValidator | undefined {
    return all.find((v) => v.name === key) || all.find((v) => v.title === key);
  }
  
  /* -------------------- Purpose inference (tolerates publish) -------------------- */
  
  function flattenArgChoice(arg?: Cip57Arg | { oneOf: Cip57Arg[] }): Cip57Arg[] {
    if (!arg) return [];
    const maybe = arg as any;
    if ("oneOf" in maybe && Array.isArray(maybe.oneOf)) return maybe.oneOf as Cip57Arg[];
    return [arg as Cip57Arg];
  }
  
  function acceptPurposeRaw(set: Set<Cip57Purpose>, p: unknown) {
    if (!p) return;
    // string case
    if (typeof p === "string") {
      const s = p.toLowerCase();
      if (s === "spend" || s === "mint" || s === "withdraw" || s === "publish") {
        set.add(s as Cip57Purpose);
      }
      return;
    }
    // { oneOf: Cip57Purpose[] } case
    const maybe = p as any;
    if (maybe && typeof maybe === "object" && Array.isArray(maybe.oneOf)) {
      for (const q of maybe.oneOf) acceptPurposeRaw(set, q);
    }
  }
  
  export function inferPurposes(v: Cip57Validator): Cip57Purpose[] {
    const set = new Set<Cip57Purpose>();
  
    // Heuristic from title suffix (Aiken emits "... .spend", "... .mint", "... .withdraw").
    // Also tolerate ".publish" even if your public API doesn’t use it yet.
    const t = (v.title || "").toLowerCase();
    if (t.endsWith(".spend")) set.add("spend");
    if (t.endsWith(".mint")) set.add("mint");
    if (t.endsWith(".withdraw")) set.add("withdraw");
    if (t.endsWith(".publish")) set.add("publish" as Cip57Purpose);
  
    // Explicit purposes attached to args (string or { oneOf: [...] }).
    for (const a of flattenArgChoice(v.redeemer)) acceptPurposeRaw(set, a.purpose as any);
    for (const a of flattenArgChoice(v.datum)) acceptPurposeRaw(set, a.purpose as any);
    if (Array.isArray(v.parameters)) {
      for (const pa of v.parameters) {
        for (const a of flattenArgChoice(pa as any)) acceptPurposeRaw(set, a.purpose as any);
      }
    }
  
    return Array.from(set);
  }
  
  /* -------------------- Validators normalization -------------------- */
  
  export function normalizeValidators(
    raw: Record<string, Cip57Validator> | Cip57Validator[]
  ): NormalizedValidator[] {
    const out: { name: string; v: Cip57Validator }[] = [];
  
    if (Array.isArray(raw)) {
      for (const v of raw) out.push({ name: v.title ?? "validator", v });
    } else {
      for (const [key, v] of Object.entries(raw as Record<string, Cip57Validator>)) {
        out.push({ name: key, v });
      }
    }
  
    return out.map(({ name, v }) => ({ ...v, name, purposes: inferPurposes(v) }));
  }
  
  /* -------------------- Network conversion -------------------- */
  
  export function networkToId(net: Network): 0 | 1 {
    // All non-mainnet nets use 0; mainnet uses 1
    return net === "mainnet" ? 1 : 0;
  }