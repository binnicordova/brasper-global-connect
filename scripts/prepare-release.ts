import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createDemoFixtures, demoRates } from "../src/lib/demo-fixtures";

// Builds files for manual review. Never connects to or modifies a database.
const args = process.argv.slice(2);
const after = args.length === 2 && args[0] === "--after" ? args[1]! : "none";
if (args.length && !(args.length === 2 && args[0] === "--after"))
  throw new Error("Uso: npm run prepare:release -- --after <migration.sql|none>");
const names = (await readdir("supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
if (after !== "none" && !names.includes(after)) throw new Error("Migración desconocida");
const pending = after === "none" ? names : names.slice(names.indexOf(after) + 1);
await mkdir("supabase/release", { recursive: true });
await mkdir("supabase/demo", { recursive: true });
const anchor = Date.parse("2026-10-12T12:00:00Z");
const demo = {
  version: 1,
  environment: "demo",
  generated_for: "Brasper demo",
  ...createDemoFixtures(anchor),
  rates: demoRates(anchor),
  assets: {
    receipt: "/demo/comprobante-ejemplo.pdf",
    policy: "Ejemplo local; las rutas del catálogo no crean objetos en Storage.",
  },
};
await writeFile("supabase/demo/catalog.json", JSON.stringify(demo, null, 2) + "\n");
const seed = `-- Catálogo demo aislado. Aplicar después de las migraciones operativas.
-- No crea usuarios Auth, tasas operativas, depósitos ni una cola fiscal.
begin;
create schema if not exists brasper_demo;
revoke all on schema brasper_demo from public, anon;
grant usage on schema brasper_demo to authenticated;
create table if not exists brasper_demo.catalog (
  id text primary key,
  payload jsonb not null check (payload->>'environment' = 'demo'),
  updated_at timestamptz not null default now()
);
alter table brasper_demo.catalog enable row level security;
revoke all on brasper_demo.catalog from public, anon, authenticated;
grant select on brasper_demo.catalog to authenticated;
drop policy if exists demo_catalog_staff_read on brasper_demo.catalog;
create policy demo_catalog_staff_read on brasper_demo.catalog for select to authenticated
  using (public.is_staff());
insert into brasper_demo.catalog(id, payload) values ('brasper-demo-v1',
$brasper_demo$${JSON.stringify(demo)}$brasper_demo$::jsonb)
on conflict (id) do update set payload=excluded.payload, updated_at=now();
commit;
`;
await writeFile("supabase/demo/seed.sql", seed);
const files = [];
let bundle = `-- REVISAR ANTES DE EJECUTAR: solo migraciones posteriores a ${after}.
-- No repetir sobre un proyecto donde ya se aplicaron. Este archivo no configura secretos.
begin;\n`;
for (const name of pending) {
  const path = `supabase/migrations/${name}`;
  const sql = await readFile(path, "utf8");
  bundle += `\n-- Fuente: ${path}\n${sql}\n`;
  files.push({ path, sha256: createHash("sha256").update(sql).digest("hex") });
}
bundle += "\ncommit;\n";
await writeFile("supabase/release/database-update.sql", bundle);
for (const path of [
  "supabase/functions/process-invoices/index.ts",
  "supabase/config.toml",
  "supabase/fixed-rates.example.sql",
  "supabase/manual-setup.example.sql",
  "supabase/demo/catalog.json",
  "supabase/demo/seed.sql",
])
  files.push({
    path,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  });
await writeFile(
  "supabase/release/manifest.json",
  JSON.stringify(
    {
      after,
      migrations: pending,
      files,
      demoSeed: "supabase/demo/seed.sql",
      deployment: "manual; no aplicado",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Paquete preparado: ${pending.length} migraciones y ${demo.transfers.length} escenarios demo. No se aplicaron cambios remotos.`,
);
