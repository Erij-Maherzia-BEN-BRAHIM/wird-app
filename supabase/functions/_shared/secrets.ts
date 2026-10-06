import { db } from "./common.ts";

let cache: Record<string, string> | null = null;

/** Reads a secret from the environment first (CLI deploys), otherwise from the app_secrets table. */
export async function secret(name: string): Promise<string> {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv;
  if (!cache) {
    const { data } = await db.from("app_secrets").select("name,value");
    cache = Object.fromEntries((data ?? []).map((r) => [r.name, r.value]));
  }
  return cache[name] ?? "";
}
