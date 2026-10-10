import { create } from "xmlbuilder2";
import type { IXmlBuilder, XmlBuilderOptions } from "./xml-builder";
import {
  SUNAT_NAMESPACES,
  buildUBLExtensions,
  buildSignatureSection,
  buildSupplierParty,
  buildCustomerParty,
  buildDocumentTaxes,
  buildLegalMonetaryTotal,
  buildInvoiceLines,
} from "./xml-builder";

export class FacturaBuilder implements IXmlBuilder {
  build({ emisor, comprobante }: XmlBuilderOptions): string {
    const { serie, correlativo, fechaEmision, moneda, receptor, lineas, totales } = comprobante;
    const totalLetras = `${totales.totalVenta.toFixed(2)} ${moneda}`;

    const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("Invoice", {
      xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      ...SUNAT_NAMESPACES,
    });

    buildUBLExtensions(doc);
    doc.ele("cbc:UBLVersionID").txt("2.1").up();
    doc.ele("cbc:CustomizationID").txt("2.0").up();
    doc.ele("cbc:ID").txt(`${serie}-${correlativo}`).up();
    doc.ele("cbc:IssueDate").txt(fechaEmision).up();
    doc.ele("cbc:InvoiceTypeCode", { listID: "0101" }).txt("01").up();
    doc.ele("cbc:Note", { languageLocaleID: "1000" }).txt(totalLetras).up();
    if (comprobante.nota) doc.ele("cbc:Note").txt(comprobante.nota).up();
    doc.ele("cbc:DocumentCurrencyCode").txt(moneda).up();

    buildSignatureSection(doc, emisor.ruc, emisor.razonSocial);
    buildSupplierParty(doc, emisor);
    buildCustomerParty(doc, receptor);
    doc
      .ele("cac:PaymentTerms")
      .ele("cbc:ID")
      .txt("FormaPago")
      .up()
      .ele("cbc:PaymentMeansID")
      .txt("Contado")
      .up()
      .up();
    buildDocumentTaxes(doc, comprobante);
    buildLegalMonetaryTotal(doc, totales, moneda);
    buildInvoiceLines(doc, lineas, moneda);

    return doc.end({ prettyPrint: true });
  }
}
