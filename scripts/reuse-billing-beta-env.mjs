import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Copy only the authorized beta API key. Never copy the hotel database or SOL credentials.
const source = resolve(process.argv[2] || "../../facturacion/.env.beta");
const line = readFileSync(source, "utf8")
  .split(/\r?\n/)
  .find((s) => /^BETA_API_KEY=/.test(s));
let key = line?.slice("BETA_API_KEY=".length).trim();
if (
  key &&
  ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
)
  key = key.slice(1, -1);
if (!key || !/^[A-Za-z0-9_.-]{16,256}$/.test(key))
  throw new Error("Missing or unsupported beta key; no secret printed");
writeFileSync(
  ".env.billing-beta",
  `BETA_API_KEY=${key}\nBILLING_GATEWAY_TOKEN=${key}\nBILLING_WORKER_SECRET=${key}\nBILLING_BETA_ENABLED=true\nBILLING_ENVIRONMENT=beta\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Authorized beta key configured privately in .env.billing-beta (Git ignored). Add Brasper backend secrets to activate the queue.",
);
