import { readFileSync, existsSync, lstatSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
export function localSetting(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const path = resolve(process.cwd(), ".env.local");
  try {
    if (lstatSync(path).isSymbolicLink()) return "";
    const line = readFileSync(path, "utf8")
      .split(/\r?\n/)
      .find((l) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(l));
    const value = line?.replace(/^[^=]*=\s*/, "").trim() || "";
    return value.replace(/^(["'])(.*)\1$/, "$2");
  } catch {
    return "";
  }
}
export function isLocalRequest(request: Request) {
  const url = new URL(request.url);
  return (
    process.env["NODE_ENV"] !== "production" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  );
}
export function sameOrigin(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    !["cross-site", "none"].includes(request.headers.get("sec-fetch-site") || "same-origin")
  );
}
export async function configureLocalKey(request: Request) {
  if (!isLocalRequest(request) || !sameOrigin(request))
    return Response.json({ error: "Solo disponible desde el formulario local." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return Response.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  let key: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) throw Error();
    key = JSON.parse(body).key;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{20,500}$/.test(key.trim()))
    return Response.json({ error: "La clave no tiene el formato esperado." }, { status: 400 });
  const path = resolve(process.cwd(), ".env.local");
  try {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error();
    // This destination is ignored by this repository. Never write a secret to a tracked file.
    const { execFileSync } = await import("node:child_process");
    let tracked = false;
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", ".env.local"], { stdio: "ignore" });
      tracked = true;
    } catch {
      /* untracked */
    }
    if (tracked)
      return Response.json(
        { error: "El archivo está versionado; no se guardó la clave." },
        { status: 409 },
      );
    const lines = (existsSync(path) ? readFileSync(path, "utf8") : "")
      .split(/\r?\n/)
      .filter((l) => !/^\s*(?:export\s+)?OPENAI_API_KEY\s*=/.test(l));
    lines.push("OPENAI_API_KEY=" + key.trim());
    writeFileSync(path, lines.join("\n").trim() + "\n", { mode: 0o600 });
    chmodSync(path, 0o600);
    return Response.json(
      { ok: true, message: "Clave guardada en .env.local. Ya puedes abrir el asistente." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "No se pudo guardar la clave local." }, { status: 500 });
  }
}

export async function saveLocalSettings(values: Record<string, string>) {
  const path = resolve(process.cwd(), ".env.local");
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error("Unsafe destination");
  const { execFileSync } = await import("node:child_process");
  let tracked = false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", ".env.local"], { stdio: "ignore" });
    tracked = true;
  } catch {
    /* untracked */
  }
  if (tracked) throw Error("Tracked destination");
  const lines = (existsSync(path) ? readFileSync(path, "utf8") : "")
    .split(/\r?\n/)
    .filter(
      (l) =>
        !Object.keys(values).some((name) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(l)),
    );
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(name) || /[\r\n]/.test(value)) throw Error("Invalid setting");
    lines.push(name + "=" + value);
  }
  writeFileSync(path, lines.join("\n").trim() + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}
