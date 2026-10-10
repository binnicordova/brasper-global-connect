import {
  TEST_P12_BASE64,
  TEST_P12_PASSWORD,
  TEST_PRIVATE_KEY_PEM,
  TEST_CERTIFICATE_PEM,
} from "./public-test-certificate";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";

export interface SignerOptions {
  pfxBase64: string;
  pfxPassword: string;
}
export interface IXmlSigner {
  sign(xml: string, options: SignerOptions): string;
  verify(signedXml: string, publicKeyPem: string): boolean;
}
const DS = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** Beta-only: accepts the existing deliberately public fixture, no production P12. */
export function readCertificate(options: SignerOptions) {
  if (options.pfxBase64 !== TEST_P12_BASE64 || options.pfxPassword !== TEST_P12_PASSWORD)
    throw new Error("Only the public beta certificate is supported");
  return { privateKey: TEST_PRIVATE_KEY_PEM, publicCert: TEST_CERTIFICATE_PEM };
}

export class XmlSigner implements IXmlSigner {
  sign(xml: string, options: SignerOptions): string {
    const { privateKey, publicCert } = readCertificate(options);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const uri = doc.getElementsByTagNameNS(
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      "URI",
    )[0]?.textContent;
    const id = uri?.startsWith("#") ? uri.slice(1) : "SUNAT-SIGN";
    if (doc.getElementsByTagNameNS(DS, "Signature").length)
      throw new Error("El XML ya está firmado");
    const sig = new SignedXml({
      privateKey,
      publicCert,
      canonicalizationAlgorithm: C14N,
      signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    });
    sig.addReference({
      xpath: "/*",
      isEmptyUri: true,
      transforms: [`${DS}enveloped-signature`, C14N],
      digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    });
    sig.computeSignature(xml, {
      prefix: "ds",
      attrs: { Id: id },
      location: {
        reference:
          "//*[local-name()='ExtensionContent' and namespace-uri()='urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2']",
        action: "append",
      },
    });
    const signed = sig.getSignedXml();
    if (!this.verify(signed, publicCert))
      throw new Error("La firma generada no pasó la verificación criptográfica");
    return signed;
  }

  verify(signedXml: string, publicKeyPem: string): boolean {
    try {
      if (/<!DOCTYPE|<!ENTITY/i.test(signedXml)) return false;
      const doc = new DOMParser().parseFromString(signedXml, "application/xml");
      const nodes = doc.getElementsByTagNameNS(DS, "Signature");
      if (nodes.length !== 1) return false;
      const references = nodes[0]!.getElementsByTagNameNS(DS, "Reference");
      if (references.length !== 1 || references[0]!.getAttribute("URI") !== "") return false;
      const sig = new SignedXml({ publicCert: publicKeyPem, getCertFromKeyInfo: () => null });
      // xml-crypto uses the standard DOM typings; xmldom supplies the DOM implementation.
      sig.loadSignature(nodes[0] as unknown as Node);
      return sig.checkSignature(signedXml) && sig.getSignedReferences().length === 1;
    } catch {
      return false;
    }
  }
}
export const xmlSigner = new XmlSigner();
