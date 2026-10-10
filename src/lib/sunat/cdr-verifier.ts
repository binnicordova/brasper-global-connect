import { X509Certificate, createHash } from "node:crypto";
import { SignedXml } from "xml-crypto";
import type { Document } from "@xmldom/xmldom";

export type CdrVerification = {
  firma: "valida" | "invalida" | "ausente" | "no_disponible_beta";
  certificadoSha256: string | null;
  identidad: "sin_validar";
};
const DS = "http://www.w3.org/2000/09/xmldsig#";
/** Verifies integrity with the embedded certificate. This is NOT PKI trust validation. */
export function verifyCdrSignature(xml: string, doc: Document, beta = false): CdrVerification {
  const result: CdrVerification = {
    firma: "invalida",
    certificadoSha256: null,
    identidad: "sin_validar",
  };
  const signatures = doc.getElementsByTagNameNS(DS, "Signature");
  if (signatures.length === 0) return { ...result, firma: "ausente" };
  if (signatures.length !== 1) return result;
  try {
    const signature = signatures[0]!;
    const references = signature.getElementsByTagNameNS(DS, "Reference");
    const certs = signature.getElementsByTagNameNS(DS, "X509Certificate");
    if (references.length !== 1 || references[0]!.getAttribute("URI") !== "" || certs.length !== 1)
      return result;
    // Observed only on the official beta endpoint. Never permit this in a production verifier.
    if (
      beta &&
      certs[0]!.textContent?.trim() === "*Named certificate 'BetaPrivateKey' not up*" &&
      signature.getElementsByTagNameNS(DS, "SignatureValue")[0]?.textContent?.trim() ===
        "*Private key 'BetaPublicCert' not up*"
    )
      return { ...result, firma: "no_disponible_beta" };
    const encoded = certs[0]!.textContent?.replace(/\s/g, "") ?? "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 20000) return result;
    const der = Buffer.from(encoded, "base64");
    const cert = new X509Certificate(der);
    result.certificadoSha256 = createHash("sha256").update(der).digest("hex");
    const verifier = new SignedXml({
      publicCert: cert.toString(),
      getCertFromKeyInfo: () => null,
    });
    verifier.loadSignature(signature as unknown as Node);
    if (verifier.checkSignature(xml) && verifier.getSignedReferences().length === 1)
      result.firma = "valida";
  } catch {
    /* Invalid certificates, unsupported transforms or broken signatures are rejected. */
  }
  return result;
}
