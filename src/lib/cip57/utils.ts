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
  
  // Flatten an arg that may be a single Cip57Arg or { oneOf: Cip57Arg[] }.
  export function flattenArgChoice(arg?: Cip57Arg | { oneOf: Cip57Arg[] }): Cip57Arg[] {
    if (!arg) return [];
    if (typeof arg === "object" && "oneOf" in arg && Array.isArray((arg as any).oneOf)) {
      return ((arg as any).oneOf as Cip57Arg[]).filter(Boolean);
    }
    return [arg as Cip57Arg];
  }
  
  // Read a raw purpose (string or { oneOf: [...] }, allowing nesting) and add valid values to the set.
  export function acceptPurposeRaw(set: Set<Cip57Purpose>, p: unknown): void {
    if (p == null) return;
  
    const addIfValid = (s: string) => {
      const k = s.trim().toLowerCase();
      if (k === "spend" || k === "mint" || k === "withdraw" || k === "publish") {
        set.add(k as Cip57Purpose);
      }
    };
  
    if (typeof p === "string") {
      addIfValid(p);
      return;
    }
  
    if (typeof p === "object") {
      const o = p as any;
  
      // { oneOf: [...] } where elements can be strings or nested objects
      if (Array.isArray(o.oneOf)) {
        for (const q of o.oneOf) acceptPurposeRaw(set, q);
        return;
      }
  
      // Be tolerant if an unexpected wrapper { purpose: ... } shows up
      if ("purpose" in o) {
        acceptPurposeRaw(set, o.purpose);
        return;
      }
    }
  }
  
  // Infer purposes from explicit arg-level declarations; if none, fall back to title suffix.
  // Returns [] if nothing explicit or inferable exists.
  export function inferPurposes(v: Cip57Validator): Cip57Purpose[] {
      const explicit = new Set<Cip57Purpose>();
    
      // Collect explicit purposes from redeemer, datum, and parameters
      for (const a of flattenArgChoice(v.redeemer)) acceptPurposeRaw(explicit, (a as any).purpose);
      for (const a of flattenArgChoice(v.datum))    acceptPurposeRaw(explicit, (a as any).purpose);
      if (Array.isArray(v.parameters)) {
        for (const pa of v.parameters) {
          for (const a of flattenArgChoice(pa as any)) acceptPurposeRaw(explicit, (a as any).purpose);
        }
      }
    
      if (explicit.size > 0) {
        return Array.from(explicit);
      }
    
      // Heuristic from title: match a trailing whole word (spend|mint|withdraw|publish)
      const title = (v.title ?? "").trim().toLowerCase();
      const m = /\b(spend|mint|withdraw|publish)\b\s*$/i.exec(title);
      return m ? [m[1]?.toLowerCase() as Cip57Purpose] : [];
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