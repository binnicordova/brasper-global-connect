import { PDFDocument, StandardFonts } from "pdf-lib";
import { FacturaBuilder } from "./ubl/factura.builder";
import { XmlSigner } from "./xml-signer";
import { BetaTransport } from "./beta-transport";
import { TEST_P12_BASE64, TEST_P12_PASSWORD } from "./public-test-certificate";
import type { ComprobanteInput, EmisorConfig } from "./legacy-types";
export type BetaPrepared = { xml: string; pdfBase64: string; fileName: string; reference: string };
/** Reused HOTEL JB engine primitives; only fictional Brasper tests and a public certificate. */
export class BrasperBetaEngine {
  constructor(private readonly transport = new BetaTransport()) {}
  async prepare(
    number: number,
    date: string,
    serie: "F902" | "F903" = "F902",
  ): Promise<BetaPrepared> {
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      number > 99999999 ||
      !["F902", "F903"].includes(serie) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new Error("Numeración o fecha beta no válida");
    const emisor: EmisorConfig = {
      ruc: "20608550454",
      razonSocial: "BRASPER 21 SAC - PRUEBA BETA",
      direccionFiscal: "DOMICILIO FICTICIO PARA PRUEBAS BETA",
      ubigeo: "150101",
      codigoLocal: "0000",
      certificadoBase64: TEST_P12_BASE64,
      certificadoClave: TEST_P12_PASSWORD,
      ambiente: "beta",
      apiKey: "",
    };
    // Fixed fictional values. Never derive taxable amounts or a tax rate from a remittance.
    const c: ComprobanteInput = {
      tipo: "01",
      serie,
      correlativo: String(number),
      fechaEmision: date,
      moneda: "PEN",
      receptor: { tipoDoc: "6", numDoc: "20100070970", razonSocial: "CLIENTE FICTICIO BETA" },
      lineas: [
        {
          descripcion: "PRUEBA SIN VALIDEZ TRIBUTARIA: servicio de transferencia ficticio",
          cantidad: 1,
          valorUnitario: 100,
          precioUnitario: 118,
          unidadMedida: "ZZ",
          afectacionIgv: "10",
          tasaIgv: 18,
          igvLinea: 18,
          totalLinea: 118,
        },
      ],
      totales: { valorVenta: 100, totalIgv: 18, totalVenta: 118 },
      nota: "PRUEBA BETA - SIN VALIDEZ TRIBUTARIA. No representa esta remesa ni una venta real.",
    };
    const xml = new XmlSigner().sign(new FacturaBuilder().build({ emisor, comprobante: c }), {
      pfxBase64: TEST_P12_BASE64,
      pfxPassword: TEST_P12_PASSWORD,
    });
    const reference = `${serie}-${number}`;
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica),
      page = pdf.addPage();
    [
      "PRUEBA BETA - SIN VALIDEZ TRIBUTARIA",
      `BRASPER 21 SAC - RUC ${emisor.ruc}`,
      `${reference} - ${date}`,
      "CLIENTE FICTICIO BETA",
      "Servicio ficticio: base PEN 100.00; impuesto de ensayo PEN 18.00",
      "TOTAL FICTICIO PEN 118.00",
      "No representa una transferencia ni un comprobante fiscal real.",
      "No se enviaron datos personales del cliente a SUNAT beta.",
    ].forEach((text, i) => page.drawText(text, { x: 35, y: 780 - i * 28, size: 10, font }));
    return {
      xml,
      pdfBase64: Buffer.from(await pdf.save()).toString("base64"),
      reference,
      fileName: `${emisor.ruc}-01-${reference}`,
    };
  }
  send(p: BetaPrepared) {
    return this.transport.send("sendBill", p.fileName, p.xml, p.reference);
  }
}
