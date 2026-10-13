import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
const origin = "http://127.0.0.1:8692",
  pub = resolve(".output/public");
let app;
async function validated(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return false;
  const r = await fetch(origin + "/api/whatsapp-web?token=" + encodeURIComponent(token));
  return r.ok;
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:8695");
    let token =
      req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("brasper_cap="))
        ?.slice(12) || "";
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };
    const finish = (status, body, type = "text/plain") => {
      res.writeHead(status, { ...headers, "Content-Type": type });
      res.end(body);
    };
    try {
      if (url.pathname === "/healthz" && req.method === "GET")
        return finish(200, JSON.stringify({ ok: true }), "application/json");
      const webhook = url.pathname === "/api/whatsapp/webhook";
      const entry = url.pathname.match(/^\/cambio\/([A-Za-z0-9_-]{43})$/);
      if (entry) {
        if (req.method !== "GET" || !(await validated(entry[1])))
          return finish(401, "Este enlace no existe o caducó. Pide uno nuevo en WhatsApp.");
        token = entry[1];
        res.setHeader(
          "Set-Cookie",
          `brasper_cap=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`,
        );
        return finish(
          200,
          `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brasper · Tu cambio desde WhatsApp</title><style>body{font:15px system-ui;color:#122344;margin:0;background:#f2f6f9}header{padding:16px 20px;background:white;display:flex;justify-content:space-between;align-items:center}b{font-size:25px}a{color:#008575}iframe{width:100%;height:1500px;border:0}#done{padding:40px 24px;text-align:center;line-height:1.7}[hidden]{display:none!important}</style><header><b>brasper.</b><a href="https://wa.me/15551968909">Volver al chat</a></header><iframe id="form" title="Formulario Brasper" src="/transferencias?demo=1&embed=1&wa=${token}"></iframe><div id="done" hidden><h1>Solicitud recibida</h1><p>El equipo revisará el ingreso antes de continuar. Puedes volver al chat para seguir conversando.</p><a href="https://wa.me/15551968909">Regresar a WhatsApp →</a></div><script>const f=document.getElementById('form');addEventListener('message',e=>{if(e.origin===location.origin&&e.source===f.contentWindow&&e.data?.type==='brasper:exchange-created'){f.hidden=true;document.getElementById('done').hidden=false}})</script></html>`,
          "text/html; charset=utf-8",
        );
      }
      if (!webhook) {
        if (!(await validated(token))) return finish(401, "Enlace privado requerido.");
        if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
          const path = resolve(pub, "." + decodeURIComponent(url.pathname));
          if (!path.startsWith(pub + sep) || !/\.(js|css|png|jpe?g|svg|webp|woff2?)$/.test(path))
            return finish(404, "Not found");
          const mime = path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : path.endsWith(".svg")
                ? "image/svg+xml"
                : path.endsWith(".jpg")
                  ? "image/jpeg"
                  : path.endsWith(".woff2")
                    ? "font/woff2"
                    : "application/octet-stream";
          return finish(200, await readFile(path), mime);
        }
        if (req.method === "GET" && url.pathname === "/transferencias") {
          if (url.searchParams.get("wa") !== token) return finish(403, "Sesión inválida");
          app ||= (await import("../.output/server/index.mjs")).default;
          const r = await app.fetch(
            new Request("http://localhost" + url.pathname + url.search),
            { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
            { waitUntil: () => {} },
          );
          return finish(
            r.status,
            Buffer.from(await r.arrayBuffer()),
            r.headers.get("content-type") || "text/html",
          );
        }
        if (url.pathname !== "/api/whatsapp-web" || req.method !== "POST")
          return finish(404, "Not found");
        const config = await (await fetch(origin + "/api/whatsapp-setup")).json();
        if (
          ![config.callback, config.previousCallback]
            .filter(Boolean)
            .map((u) => new URL(u).origin)
            .includes(req.headers.origin)
        )
          return finish(403, "Origen no autorizado");
      }
      if (!["GET", "POST"].includes(req.method)) return finish(405, "Method not allowed");
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (webhook ? 65536 : 5500000)) return finish(413, "Too large");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!webhook) {
        const form = await new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": req.headers["content-type"] || "" },
          body,
        }).formData();
        if (form.get("token") !== token) return finish(403, "Sesión inválida");
      }
      const r = await fetch(origin + url.pathname + url.search, {
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
          "x-hub-signature-256": req.headers["x-hub-signature-256"] || "",
        },
        ...(req.method === "POST" ? { body } : {}),
      });
      finish(
        r.status,
        Buffer.from(await r.arrayBuffer()),
        r.headers.get("content-type") || "text/plain",
      );
    } catch {
      finish(
        502,
        "No se pudo completar la solicitud. Vuelve a intentar desde tu enlace de WhatsApp.",
      );
    }
  })
  .listen(8695, "127.0.0.1", () =>
    console.log(
      "Webhook y formulario privado en 127.0.0.1:8695. Configuración y dashboard bloqueados.",
    ),
  );
