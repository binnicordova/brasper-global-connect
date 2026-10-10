import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import { create } from "xmlbuilder2";
import { verifyCdrSignature } from "./cdr-verifier";
import type { CdrVerification } from "./cdr-verifier";

export const BETA_ENDPOINT = "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
export type BetaResult = {
  estado: "aceptado" | "observado" | "rechazado" | "enviado" | "incierto";
  codigo: string;
  mensaje: string;
  ticket: string | null;
  cdrBase64: string | null;
  cdrVerificacion?: CdrVerification | undefined;
};
export function parseXml(xml: string) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("XML no permitido");
  return new DOMParser({
    onError: (level) => {
      if (level !== "warning") throw new Error("XML inválido");
    },
  }).parseFromString(xml, "application/xml");
}
export async function parseBetaCdr(base64: string, expectedId: string): Promise<BetaResult> {
  if (base64.length > 1_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw new Error("CDR codificado inválido");
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const files = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".xml"),
  );
  if (files.length !== 1) throw new Error("CDR debe contener un único XML");
  const file = files[0]!;
  const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data
    ?.uncompressedSize;
  if (size === undefined || size > 2_000_000) throw new Error("CDR excede el límite de lectura");
  const rawXml = await file.async("string");
  const doc = parseXml(rawXml);
  if (doc.documentElement?.localName !== "ApplicationResponse")
    throw new Error("CDR no es ApplicationResponse");
  const responses = doc.getElementsByTagNameNS("*", "Response");
  if (responses.length !== 1) throw new Error("CDR sin una respuesta única");
  const response = responses[0]!;
  const text = (name: string) =>
    response.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() ?? "";
  const codigo = text("ResponseCode");
  if (!/^\d+$/.test(codigo)) throw new Error("CDR sin código válido");
  if (text("ReferenceID") !== expectedId) throw new Error("CDR corresponde a otro documento");
  const cdrVerificacion = verifyCdrSignature(rawXml, doc, true);
  if (!["valida", "no_disponible_beta"].includes(cdrVerificacion.firma))
    return {
      estado: "incierto",
      codigo: "CDR_FIRMA_NO_VALIDA",
      mensaje:
        "CDR recibido sin firma criptográfica válida. Conservado para revisión; no reenviar.",
      ticket: null,
      cdrBase64: base64,
      cdrVerificacion,
    };
  const notes = Array.from(doc.getElementsByTagNameNS("*", "Note")).map((n) => n.textContent ?? "");
  return {
    estado: codigo === "0" ? (notes.length ? "observado" : "aceptado") : "rechazado",
    codigo,
    mensaje: [text("Description"), ...notes].join(" · ").slice(0, 1000),
    ticket: null,
    cdrBase64: base64,
    cdrVerificacion,
  };
}
async function limitedText(response: Response) {
  if (!response.body) throw new Error("Respuesta vacía");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error("Respuesta excesiva");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
/** Persistent diagnostic categories, without copying exception messages or request data. */
function transportFailureLabel(error: unknown): string {
  if (!(error instanceof Error)) return "ERROR_DESCONOCIDO";
  const causeCode = (error as Error & { cause?: { code?: unknown } }).cause?.code;
  const code =
    typeof causeCode === "string" &&
    /^(?:ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ERR_[A-Z0-9_]{1,24})$/.test(causeCode)
      ? causeCode
      : null;
  const category = /invalid redirect value/i.test(error.message)
    ? "REDIRECT_NO_ADMITIDO"
    : /connection reset|socket hang up/i.test(error.message)
      ? "CONEXION_REINICIADA"
      : /(?:certificate|\btls\b)/i.test(error.message)
        ? "TLS"
        : /fetch failed/i.test(error.message)
          ? "FETCH_FALLIDO"
          : ["TypeError", "TimeoutError", "AbortError", "NetworkError"].includes(error.name)
            ? error.name
            : "ERROR_NO_CLASIFICADO";
  return code ? `${category}/${code}` : category;
}
/** Beta-only, public test credentials, one request: never retry an uncertain submission. */
export class BetaTransport {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async call(
    method: "sendBill" | "sendSummary" | "getStatus",
    params: Record<string, string>,
    expectedId: string,
  ): Promise<BetaResult> {
    const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("soapenv:Envelope", {
      "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
      "xmlns:ser": "http://service.sunat.gob.pe",
      "xmlns:wsse":
        "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd",
    });
    doc
      .ele("soapenv:Header")
      .ele("wsse:Security")
      .ele("wsse:UsernameToken")
      .ele("wsse:Username")
      .txt("20608550454MODDATOS")
      .up()
      .ele("wsse:Password")
      .txt("MODDATOS")
      .up()
      .up()
      .up()
      .up();
    const body = doc.ele("soapenv:Body").ele(`ser:${method}`);
    for (const [key, value] of Object.entries(params)) body.ele(key).txt(value).up();
    let failureCode = "CONEXION_NO_CONFIRMADA";
    try {
      const response = await this.fetcher(BETA_ENDPOINT, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
        body: doc.end(),
        signal: AbortSignal.timeout(25000),
      });
      failureCode = `HTTP_${response.status}_RESPUESTA_INVALIDA`;
      if (response.status >= 300 && response.status < 400)
        throw new Error("Redirección inesperada de SUNAT beta");
      const xml = parseXml(await limitedText(response));
      if (
        xml.documentElement?.localName !== "Envelope" ||
        xml.documentElement.namespaceURI !== "http://schemas.xmlsoap.org/soap/envelope/"
      )
        throw new Error("Respuesta sin SOAP Envelope");
      const bodies = xml.getElementsByTagNameNS(
        "http://schemas.xmlsoap.org/soap/envelope/",
        "Body",
      );
      if (bodies.length !== 1) throw new Error("Respuesta sin SOAP Body único");
      const soap = bodies[0]!;
      const text = (name: string) =>
        soap.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() ?? "";
      const fault = text("faultcode");
      if (fault)
        return {
          estado: "rechazado",
          codigo: fault.slice(0, 100),
          mensaje: text("faultstring").slice(0, 1000),
          ticket: null,
          cdrBase64: null,
        };
      if (!response.ok) throw new Error("Error HTTP sin SOAP Fault");
      const cdr = text("applicationResponse") || text("content");
      if (cdr) {
        failureCode = "CDR_INVALIDO";
        return await parseBetaCdr(cdr, expectedId);
      }
      const ticket = text("ticket");
      if (method === "sendSummary" && /^\d{1,64}$/.test(ticket))
        return {
          estado: "enviado",
          codigo: "TICKET",
          mensaje: "Resumen enviado; falta consultar su CDR.",
          ticket,
          cdrBase64: null,
        };
      if (method === "getStatus" && text("statusCode") === "98")
        return {
          estado: "enviado",
          codigo: "98",
          mensaje: "SUNAT beta sigue procesando el resumen.",
          ticket: params["ticket"] ?? null,
          cdrBase64: null,
        };
      failureCode = "SOAP_SIN_RESULTADO";
      throw new Error("Respuesta sin CDR, ticket o estado reconocido");
    } catch (error) {
      const failureLabel = transportFailureLabel(error);
      return {
        estado: "incierto",
        codigo:
          error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
            ? "SUNAT_TIMEOUT"
            : failureCode,
        mensaje: `No se pudo confirmar una respuesta válida de SUNAT beta. No reenviar automáticamente. Diagnóstico: ${failureLabel}.`,
        ticket: params["ticket"] ?? null,
        cdrBase64: null,
      };
    }
  }
  async send(
    method: "sendBill" | "sendSummary",
    fileName: string,
    xml: string,
    expectedId: string,
  ) {
    const zip = new JSZip();
    zip.file(`${fileName}.xml`, xml);
    const contentFile = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
    return this.call(method, { fileName: `${fileName}.zip`, contentFile }, expectedId);
  }
}
