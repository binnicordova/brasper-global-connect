import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = process.cwd(),
  privatePath = resolve(root, "artifacts/whatsapp-beta/native-flow-private.pem"),
  publicPath = resolve(root, "public/whatsapp-flows/brand/flow-public-key.pem"),
  envPath = resolve(root, ".env.local");
for (const path of [privatePath, envPath]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw Error("Destination must not be a symlink");
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], { stdio: "ignore" });
    throw Error("Refusing to write private keys to tracked destination");
  } catch (e) {
    if (e.message === "Refusing to write private keys to tracked destination") throw e;
  }
  execFileSync("git", ["check-ignore", path], { stdio: "ignore" });
}
mkdirSync(resolve(root, "artifacts/whatsapp-beta"), { recursive: true, mode: 0o700 });
mkdirSync(resolve(root, "public/whatsapp-flows/brand"), { recursive: true });
let privateKey;
if (existsSync(privatePath)) privateKey = readFileSync(privatePath, "utf8");
else {
  privateKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey;
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
}
chmodSync(privatePath, 0o600);
writeFileSync(publicPath, createPublicKey(privateKey).export({ type: "spki", format: "pem" }));
const text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
writeFileSync(
  envPath,
  text
    .split(/\r?\n/)
    .filter((l) => !/^\s*WHATSAPP_FLOW_PRIVATE_KEY\s*=/.test(l))
    .join("\n")
    .replace(/\s+$/, "") +
    "\nWHATSAPP_FLOW_PRIVATE_KEY=" +
    JSON.stringify(privateKey) +
    "\n",
  { mode: 0o600 },
);
chmodSync(envPath, 0o600);
console.log(
  "Clave privada guardada en archivo ignorado y .env.local. Clave pública lista para Meta. No se muestran valores privados.",
);
