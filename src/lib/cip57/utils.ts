import type {
    Cip57Arg,
    Cip57Blueprint,
    Cip57Purpose,
    Cip57Validator,
    NormalizedValidator,
    PlutusVersionNorm,
  } from "./types";

  import type { Network } from "@meshsdk/core";
  
  // ---- Hex helpers
  
  export function fromHex(hex: string): Uint8Array {
    const s = hex.startsWith("0x") ? hex.slice(2) : hex;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  
  export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  
  // ---- Plutus version normalization
  
  export function normalizePlutusVersion(x?: string): PlutusVersionNorm {
    const s = (x ?? "PlutusV3").toLowerCase();
    if (s.includes("v1")) return "V1";
    if (s.includes("v2")) return "V2";
    return "V3";
  }
  
  // ---- Validator picking
  
  export function pickValidatorByNameOrTitle(
    all: NormalizedValidator[],
    key: string
  ): NormalizedValidator | undefined {
    return all.find(v => v.name === key) || all.find(v => v.title === key);
  }
  
  // ---- Purpose inference (limited to spend|mint|withdraw)
  
  export function inferPurposes(v: Cip57Validator): Cip57Purpose[] {
    const set = new Set<Cip57Purpose>();
  
    // Heuristic from title suffix (Aiken emits "... .spend", "... .mint", "... .withdraw")
    const t = (v.title || "").toLowerCase();
    if (t.endsWith(".spend")) set.add("spend");
    if (t.endsWith(".mint")) set.add("mint");
    if (t.endsWith(".withdraw")) set.add("withdraw");
  
    // Optional explicit field path; accept only the 3 supported ones
    const accept = (p?: unknown) => {
      const s = String(p ?? "").toLowerCase();
      if (s === "spend" || s === "mint" || s === "withdraw") set.add(s as Cip57Purpose);
    };
    const flatten = (arg?: Cip57Arg | { oneOf: Cip57Arg[] }) =>
      arg && "oneOf" in (arg as any) && Array.isArray((arg as any).oneOf)
        ? ((arg as any).oneOf as Cip57Arg[])
        : (arg ? [arg as Cip57Arg] : []);
  
    for (const a of flatten(v.redeemer)) accept((a.purpose as any));
    for (const a of flatten(v.datum)) accept((a.purpose as any));
    if (Array.isArray(v.parameters)) {
      for (const pa of v.parameters) {
        for (const a of flatten(pa as any)) accept((a.purpose as any));
      }
    }
  
    return Array.from(set);
  }
  
  // ---- Validators normalization
  
  export function normalizeValidators(
    raw:
      | Record<string, Cip57Validator>
      | Cip57Validator[]
      | { validators: Cip57Validator[] }
  ): NormalizedValidator[] {
    const out: { name: string; v: Cip57Validator }[] = [];
    if (Array.isArray(raw)) {
      for (const v of raw) out.push({ name: v.title ?? "validator", v });
    } else if ("validators" in (raw as any) && Array.isArray((raw as any).validators)) {
      for (const v of (raw as any).validators as Cip57Validator[]) out.push({ name: v.title ?? "validator", v });
    } else {
      for (const [key, v] of Object.entries(raw as Record<string, Cip57Validator>)) out.push({ name: key, v });
    }
    return out.map(({ name, v }) => ({ ...v, name, purposes: inferPurposes(v) }));
  }

  // ---- Network conversion

  export function networkToId(net: Network): 0 | 1 {
    // All non-mainnet nets use 0; mainnet uses 1
    return net === "mainnet" ? 1 : 0;
  }