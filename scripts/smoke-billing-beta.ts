import { mkdir, writeFile } from "node:fs/promises";
import { createDemoFixtures } from "../src/lib/demo-fixtures";
import { BrasperBetaEngine } from "../src/lib/sunat/brasper-beta.server";

// One fictional beta submission, never automatically retry an uncertain result.
const engine = new BrasperBetaEngine();
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const number = Math.floor(Date.now() / 1000) % 99999999 || 1;
const operation = process.argv.includes("--operation-demo")
  ? {
      ...createDemoFixtures().transfers[4]!,
      billing_document: "20100070970",
      billing_name: "EMPRESA DEMO BETA",
    }
  : undefined;
const prepared = await engine.prepare(number, date, "F903", operation);
const folder = `artifacts/billing-beta/${prepared.reference}`;
await mkdir(folder, { recursive: true, mode: 0o700 });
await writeFile(`${folder}/invoice.xml`, prepared.xml, { mode: 0o600 });
await writeFile(`${folder}/invoice.pdf`, Buffer.from(prepared.pdfBase64, "base64"), {
  mode: 0o600,
});
const result = await engine.send(prepared);
await writeFile(`${folder}/result.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
if (result.cdrBase64)
  await writeFile(`${folder}/cdr.zip`, Buffer.from(result.cdrBase64, "base64"), { mode: 0o600 });
console.log(
  JSON.stringify({
    reference: prepared.reference,
    status: result.estado,
    code: result.codigo,
    signature: result.cdrVerificacion?.firma,
    artifacts: folder,
  }),
);
