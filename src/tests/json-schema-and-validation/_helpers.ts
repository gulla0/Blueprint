import fs from "node:fs";
import path from "node:path";

export function readJsonFixture<T = any>(filename: string): T {
  const p = path.resolve(process.cwd(), "fixtures", filename);
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s);
}

export function readTextFixture(filename: string): string {
  const p = path.resolve(process.cwd(), "fixtures", filename);
  return fs.readFileSync(p, "utf8");
}