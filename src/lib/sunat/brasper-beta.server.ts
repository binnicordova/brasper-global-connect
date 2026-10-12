import {
  buildDemoReceipt,
  type ReceiptOperation,
} from "../../../supabase/functions/_shared/demo-receipt";
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
    operation?: ReceiptOperation,
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
      ruc: "10042049579",
      razonSocial: "EMISOR DE PRUEBAS - INTEGRACION BRASPER",
      direccionFiscal: "DOMICILIO DE PRUEBAS BETA",
      ubigeo: "150101",
      codigoLocal: "0000",
      certificadoBase64: TEST_P12_BASE64,
      certificadoClave: TEST_P12_PASSWORD,
      ambiente: "beta",
      apiKey: "",
    };
    // Only the service commission is invoiced; the remittance principal is never revenue.
    // The 18% treatment is an explicit beta test assumption, not a production tax decision.
    const gross = operation
      ? Math.round(
          Number(operation.commission) *
            (operation.from_currency === "BRL" ? Number(operation.rate) : 1) *
            100,
        ) / 100
      : 118;
    if (
      !Number.isFinite(gross) ||
      gross <= 0 ||
      (operation && !["PEN", "BRL"].includes(operation.from_currency))
    )
      throw new Error("Comisión beta inválida");
    const name = operation?.billing_name || "CLIENTE DE PRUEBAS";
    const document = operation?.billing_document || "20100070970";
    if (!/^\d{11}$/.test(document) || (operation && operation.billing_type !== "factura"))
      throw new Error("Factura beta requiere razón social y RUC");
    const base = Math.round((gross / 1.18) * 100) / 100;
    const tax = Math.round((gross - base) * 100) / 100;
    const c: ComprobanteInput = {
      tipo: "01",
      serie,
      correlativo: String(number),
      fechaEmision: date,
      moneda: "PEN",
      receptor: { tipoDoc: "6", numDoc: document, razonSocial: name },
      lineas: [
        {
          descripcion: "Servicio de transferencia internacional",
          cantidad: 1,
          valorUnitario: base,
          precioUnitario: gross,
          unidadMedida: "ZZ",
          afectacionIgv: "10",
          tasaIgv: 18,
          igvLinea: tax,
          totalLinea: gross,
        },
      ],
      totales: { valorVenta: base, totalIgv: tax, totalVenta: gross },
      nota: "PRUEBA BETA - SIN VALIDEZ TRIBUTARIA. Comisión del servicio; ensayo de IGV 18%.",
    };
    const xml = new XmlSigner().sign(new FacturaBuilder().build({ emisor, comprobante: c }), {
      pfxBase64: TEST_P12_BASE64,
      pfxPassword: TEST_P12_PASSWORD,
    });
    const reference = `${serie}-${number}`;
    const receipt: ReceiptOperation = operation || {
      id: reference,
      billing_type: "factura",
      billing_name: name,
      billing_document: document,
      billing_document_type: "6",
      customer_name: name,
      customer_document: document,
      customer_email: "cliente@example.test",
      from_currency: "PEN",
      to_currency: "BRL",
      amount: 118,
      commission: 118,
      recipient_amount: 0,
      rate: 1,
      recipient_name: "Destinatario",
      recipient_bank: "Banco de destino",
      created_at: `${date}T12:00:00Z`,
    };
    const pdf = await buildDemoReceipt(
      {
        ...receipt,
        demo_meta: {
          code: operation?.demo_meta?.code || receipt.id,
          issuer: emisor.razonSocial + " · RUC " + emisor.ruc,
        },
      },
      reference,
      `${date}T12:00:00Z`,
      { beta: true, serviceTotal: gross, serviceCurrency: "PEN", taxBase: base, taxAmount: tax },
    );
    return {
      xml,
      pdfBase64: Buffer.from(pdf).toString("base64"),
      reference,
      fileName: `${emisor.ruc}-01-${reference}`,
    };
  }
  send(p: BetaPrepared) {
    return this.transport.send("sendBill", p.fileName, p.xml, p.reference);
  }
}
