import { tasaLinea, round2 } from "./totales.calculator";
import { create } from "xmlbuilder2";
import type { ComprobanteInput, EmisorConfig } from "../legacy-types";

export interface XmlBuilderOptions {
  emisor: EmisorConfig;
  comprobante: ComprobanteInput;
}

export interface IXmlBuilder {
  build(options: XmlBuilderOptions): string;
}

export const SUNAT_NAMESPACES = {
  "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  "xmlns:ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
  "xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
  "xmlns:sac": "urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1",
};

export const baseLinea = (l: ComprobanteInput["lineas"][number]) =>
  l.valorVentaLinea ?? round2(l.cantidad * l.valorUnitario);

export function buildUBLExtensions(doc: ReturnType<typeof create>) {
  return doc
    .ele("ext:UBLExtensions")
    .ele("ext:UBLExtension")
    .ele("ext:ExtensionContent")
    .up()
    .up()
    .up();
}

export function buildSignatureSection(
  doc: ReturnType<typeof create>,
  ruc: string,
  razonSocial: string,
) {
  return doc
    .ele("cac:Signature")
    .ele("cbc:ID")
    .txt(ruc)
    .up()
    .ele("cac:SignatoryParty")
    .ele("cac:PartyIdentification")
    .ele("cbc:ID")
    .txt(ruc)
    .up()
    .up()
    .ele("cac:PartyName")
    .ele("cbc:Name")
    .txt(razonSocial)
    .up()
    .up()
    .up()
    .ele("cac:DigitalSignatureAttachment")
    .ele("cac:ExternalReference")
    .ele("cbc:URI")
    .txt(`#SIGN-${ruc}`)
    .up()
    .up()
    .up()
    .up();
}

export function buildSupplierParty(doc: ReturnType<typeof create>, emisor: EmisorConfig) {
  return doc
    .ele("cac:AccountingSupplierParty")
    .ele("cac:Party")
    .ele("cac:PartyIdentification")
    .ele("cbc:ID", { schemeID: "6" })
    .txt(emisor.ruc)
    .up()
    .up()
    .ele("cac:PartyName")
    .ele("cbc:Name")
    .txt(emisor.razonSocial)
    .up()
    .up()
    .ele("cac:PartyLegalEntity")
    .ele("cbc:RegistrationName")
    .txt(emisor.razonSocial)
    .up()
    .ele("cac:RegistrationAddress")
    .ele("cbc:ID")
    .txt(emisor.ubigeo ?? "150101")
    .up()
    .ele("cbc:AddressTypeCode")
    .txt(emisor.codigoLocal ?? "0000")
    .up()
    .ele("cac:AddressLine")
    .ele("cbc:Line")
    .txt(emisor.direccionFiscal)
    .up()
    .up()
    .ele("cac:Country")
    .ele("cbc:IdentificationCode")
    .txt("PE")
    .up()
    .up()
    .up()
    .up()
    .up()
    .up();
}

export function buildCustomerParty(
  doc: ReturnType<typeof create>,
  receptor: ComprobanteInput["receptor"],
) {
  return doc
    .ele("cac:AccountingCustomerParty")
    .ele("cac:Party")
    .ele("cac:PartyIdentification")
    .ele("cbc:ID", { schemeID: receptor.tipoDoc })
    .txt(receptor.numDoc)
    .up()
    .up()
    .ele("cac:PartyLegalEntity")
    .ele("cbc:RegistrationName")
    .txt(receptor.razonSocial)
    .up()
    .ele("cac:RegistrationAddress")
    .ele("cac:AddressLine")
    .ele("cbc:Line")
    .txt(receptor.direccion ?? "")
    .up()
    .up()
    .ele("cac:Country")
    .ele("cbc:IdentificationCode")
    .txt("PE")
    .up()
    .up()
    .up()
    .up()
    .up()
    .up();
}

export function buildTaxTotal(
  doc: ReturnType<typeof create>,
  totalIgv: number,
  valorVenta: number,
  moneda: string,
) {
  return doc
    .ele("cac:TaxTotal")
    .ele("cbc:TaxAmount", { currencyID: moneda })
    .txt(totalIgv.toFixed(2))
    .up()
    .ele("cac:TaxSubtotal")
    .ele("cbc:TaxableAmount", { currencyID: moneda })
    .txt(valorVenta.toFixed(2))
    .up()
    .ele("cbc:TaxAmount", { currencyID: moneda })
    .txt(totalIgv.toFixed(2))
    .up()
    .ele("cac:TaxCategory")
    .ele("cac:TaxScheme")
    .ele("cbc:ID")
    .txt("1000")
    .up()
    .ele("cbc:Name")
    .txt("IGV")
    .up()
    .ele("cbc:TaxTypeCode")
    .txt("VAT")
    .up()
    .up()
    .up()
    .up()
    .up();
}

export function buildLegalMonetaryTotal(
  doc: ReturnType<typeof create>,
  totales: ComprobanteInput["totales"],
  moneda: string,
  tag = "cac:LegalMonetaryTotal",
) {
  return doc
    .ele(tag)
    .ele("cbc:LineExtensionAmount", { currencyID: moneda })
    .txt(totales.valorVenta.toFixed(2))
    .up()
    .ele("cbc:TaxInclusiveAmount", { currencyID: moneda })
    .txt(totales.totalVenta.toFixed(2))
    .up()
    .ele("cbc:PayableAmount", { currencyID: moneda })
    .txt(totales.totalVenta.toFixed(2))
    .up()
    .up();
}

export function buildInvoiceLines(
  doc: ReturnType<typeof create>,
  lineas: ComprobanteInput["lineas"],
  moneda: string,
) {
  lineas.forEach((linea, idx) => {
    const igvLinea = linea.igvLinea;
    const valorVentaLinea = baseLinea(linea);
    doc
      .ele("cac:InvoiceLine")
      .ele("cbc:ID")
      .txt(String(idx + 1))
      .up()
      .ele("cbc:InvoicedQuantity", { unitCode: linea.unidadMedida })
      .txt(linea.cantidadTexto ?? String(linea.cantidad))
      .up()
      .ele("cbc:LineExtensionAmount", { currencyID: moneda })
      .txt(valorVentaLinea.toFixed(2))
      .up()
      .ele("cac:PricingReference")
      .ele("cac:AlternativeConditionPrice")
      .ele("cbc:PriceAmount", { currencyID: moneda })
      .txt(linea.precioUnitarioTexto ?? linea.precioUnitario.toFixed(2))
      .up()
      .ele("cbc:PriceTypeCode")
      .txt("01")
      .up()
      .up()
      .up()
      .ele("cac:TaxTotal")
      .ele("cbc:TaxAmount", { currencyID: moneda })
      .txt(igvLinea.toFixed(2))
      .up()
      .ele("cac:TaxSubtotal")
      .ele("cbc:TaxableAmount", { currencyID: moneda })
      .txt(valorVentaLinea.toFixed(2))
      .up()
      .ele("cbc:TaxAmount", { currencyID: moneda })
      .txt(igvLinea.toFixed(2))
      .up()
      .ele("cac:TaxCategory")
      .ele("cbc:Percent")
      .txt(String(tasaLinea(linea)))
      .up()
      .ele("cbc:TaxExemptionReasonCode")
      .txt(linea.afectacionIgv)
      .up()
      .ele("cac:TaxScheme")
      .ele("cbc:ID")
      .txt(linea.afectacionIgv === "20" ? "9997" : linea.afectacionIgv === "30" ? "9998" : "1000")
      .up()
      .ele("cbc:Name")
      .txt(linea.afectacionIgv === "20" ? "EXO" : linea.afectacionIgv === "30" ? "INA" : "IGV")
      .up()
      .ele("cbc:TaxTypeCode")
      .txt(linea.afectacionIgv === "30" ? "FRE" : "VAT")
      .up()
      .up()
      .up()
      .up()
      .up()
      .ele("cac:Item")
      .ele("cbc:Description")
      .txt(linea.descripcion)
      .up()
      .ele("cac:SellersItemIdentification")
      .ele("cbc:ID")
      .txt(linea.codigoProducto ?? "N/A")
      .up()
      .up()
      .up()
      .ele("cac:Price")
      .ele("cbc:PriceAmount", { currencyID: moneda })
      .txt(linea.valorUnitarioTexto ?? linea.valorUnitario.toFixed(2))
      .up()
      .up()
      .up();
  });
}

export function buildDocumentTaxes(doc: ReturnType<typeof create>, comprobante: ComprobanteInput) {
  const groups = new Map<string, { base: number; tax: number; code: string }>();
  for (const l of comprobante.lineas) {
    const key = `${l.afectacionIgv}-${tasaLinea(l)}`;
    const g = groups.get(key) ?? { base: 0, tax: 0, code: l.afectacionIgv };
    g.base = round2(g.base + baseLinea(l));
    g.tax = round2(g.tax + l.igvLinea);
    groups.set(key, g);
  }
  const tax = doc.ele("cac:TaxTotal");
  tax
    .ele("cbc:TaxAmount", { currencyID: comprobante.moneda })
    .txt(comprobante.totales.totalIgv.toFixed(2))
    .up();
  for (const g of groups.values()) {
    const scheme =
      g.code === "20"
        ? ["9997", "EXO", "VAT"]
        : g.code === "30"
          ? ["9998", "INA", "FRE"]
          : ["1000", "IGV", "VAT"];
    tax
      .ele("cac:TaxSubtotal")
      .ele("cbc:TaxableAmount", { currencyID: comprobante.moneda })
      .txt(g.base.toFixed(2))
      .up()
      .ele("cbc:TaxAmount", { currencyID: comprobante.moneda })
      .txt(g.tax.toFixed(2))
      .up()
      .ele("cac:TaxCategory")
      .ele("cac:TaxScheme")
      .ele("cbc:ID")
      .txt(scheme[0]!)
      .up()
      .ele("cbc:Name")
      .txt(scheme[1]!)
      .up()
      .ele("cbc:TaxTypeCode")
      .txt(scheme[2]!)
      .up()
      .up()
      .up()
      .up();
  }
  tax.up();
}
