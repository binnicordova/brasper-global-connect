import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReceiptOperation = {
  id: string;
  billing_type?: string;
  billing_name?: string | null;
  billing_document?: string | null;
  billing_document_type?: string | null;
  billing_email?: string | null;
  billing_address?: string | null;
  customer_name: string;
  customer_document: string;
  customer_email: string;
  from_currency: string;
  to_currency: string;
  amount: number | string;
  commission: number | string;
  recipient_amount: number | string;
  rate: number | string;
  recipient_name: string;
  recipient_bank: string;
  payout_reference?: string | null;
  created_at: string;
  payout_at?: string | null;
  demo_meta?: { code: string; issuer: string };
};

export type ReceiptPresentation = {
  beta?: boolean;
  serviceTotal: number;
  serviceCurrency: string;
  taxBase: number;
  taxAmount: number;
};
/** Presentation document only: no fiscal XML, CDR or invented tax treatment. */
export async function buildDemoReceipt(
  t: ReceiptOperation,
  number: string,
  issuedAt: string,
  fiscal?: ReceiptPresentation,
) {
  const brazil = t.billing_type === "nfse";
  const serviceCurrency = fiscal?.serviceCurrency ?? (brazil ? "BRL" : t.from_currency);
  const serviceTotal =
    fiscal?.serviceTotal ??
    (brazil && t.from_currency !== "BRL"
      ? Math.round(Number(t.commission) * Number(t.rate) * 100) / 100
      : t.commission);
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    `${brazil ? "NFS-e" : t.billing_type === "boleta" ? "Boleta" : "Factura"} demo ${number}`,
  );
  pdf.setAuthor("Brasper");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.07, 0.14, 0.22),
    teal = rgb(0, 0.47, 0.4),
    muted = rgb(0.38, 0.44, 0.51),
    pale = rgb(0.94, 0.97, 0.97);
  const page = pdf.addPage([595, 842]);
  // Helvetica supports Spanish accents; replace unsupported glyphs without losing the rest of a name.
  const clean = (value: unknown) =>
    [...String(value ?? "")]
      .map((c) => {
        try {
          regular.encodeText(c);
          return c;
        } catch {
          return "-";
        }
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const text = (value: unknown, x: number, y: number, size = 10, color = navy, heavy = false) =>
    page.drawText(clean(value), { x, y, size, color, font: heavy ? bold : regular });
  const wrap = (value: unknown, x: number, y: number, width: number, size = 10, maxLines = 3) => {
    let remaining = clean(value);
    for (let i = 0; i < maxLines && remaining; i++) {
      let count = 0;
      while (
        count < remaining.length &&
        regular.widthOfTextAtSize(remaining.slice(0, count + 1), size) <= width
      )
        count++;
      if (count === remaining.length) {
        text(remaining, x, y - i * 14, size);
        break;
      }
      if (i === maxLines - 1) {
        let line = remaining.slice(0, count);
        while (regular.widthOfTextAtSize(line + "...", size) > width) line = line.slice(0, -1);
        text(line + "...", x, y - i * 14, size);
        break;
      }
      const space = remaining.slice(0, count).lastIndexOf(" ");
      const end = space > 0 ? space : count;
      text(remaining.slice(0, end), x, y - i * 14, size);
      remaining = remaining.slice(end).trimStart();
    }
  };
  const money = (value: number | string, currency: string) =>
    `${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const date = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
  }).format(new Date(issuedAt));
  page.drawRectangle({ x: 0, y: 724, width: 595, height: 118, color: navy });
  text("brasper.", 40, 790, 30, rgb(1, 1, 1), true);
  text("TRANSFERENCIAS PERÚ - BRASIL", 42, 766, 9, rgb(0.7, 0.84, 0.84));
  text(
    brazil ? "NOTA FISCAL · NFS-e" : t.billing_type === "boleta" ? "BOLETA DE VENTA" : "FACTURA",
    345,
    793,
    brazil ? 14 : 16,
    rgb(1, 1, 1),
    true,
  );
  text(number, 345, 768, 13, rgb(1, 1, 1));
  text(fiscal?.beta ? "SUNAT BETA" : "DEMO", 345, 744, 9, rgb(0.55, 0.87, 0.78), true);
  text("EMISOR", 40, 695, 8, muted, true);
  text("FECHA DE EMISIÓN", 345, 695, 8, muted, true);
  wrap(t.demo_meta?.issuer || "Brasper - entorno demo", 40, 675, 285, 11, 2);
  text(date, 345, 675, 11);
  page.drawRectangle({ x: 40, y: 510, width: 515, height: 128, color: pale });
  text("DATOS DEL CLIENTE", 55, 618, 9, teal, true);
  wrap(t.billing_name || t.customer_name, 55, 597, 480, 12, 2);
  const docType =
    t.billing_document_type === "cpf"
      ? "CPF"
      : t.billing_document_type === "cnpj"
        ? "CNPJ"
        : t.billing_document_type === "6"
          ? "RUC"
          : t.billing_document_type === "1"
            ? "DNI"
            : "Documento";
  text(`${docType}: ${t.billing_document || t.customer_document}`, 55, 560, 10);
  wrap(t.billing_email || t.customer_email, 55, 541, 475, 10, 1);
  if (t.billing_address) wrap(t.billing_address, 55, 522, 475, 9, 1);
  text("DETALLE DEL SERVICIO", 40, 482, 9, teal, true);
  page.drawRectangle({ x: 40, y: 442, width: 515, height: 27, color: navy });
  text("DESCRIPCIÓN", 52, 452, 8, rgb(1, 1, 1), true);
  text("CANT.", 359, 452, 8, rgb(1, 1, 1), true);
  text("IMPORTE", 458, 452, 8, rgb(1, 1, 1), true);
  text(
    brazil ? "Serviço de transferência internacional" : "Servicio de transferencia internacional",
    52,
    420,
    10,
  );
  text("1", 371, 420, 10);
  text(money(serviceTotal, serviceCurrency), 448, 420, 10);
  text("El importe del comprobante corresponde a la comisión del servicio.", 52, 397, 8, muted);
  if (fiscal) {
    text(`Valor de venta: ${money(fiscal.taxBase, fiscal.serviceCurrency)}`, 52, 378, 8, muted);
    text(
      `IGV de prueba (18%): ${money(fiscal.taxAmount, fiscal.serviceCurrency)}`,
      52,
      362,
      8,
      muted,
    );
  }
  page.drawRectangle({ x: 320, y: 337, width: 235, height: 43, color: pale });
  text("TOTAL DEL SERVICIO", 332, 362, 8, muted, true);
  text(money(serviceTotal, serviceCurrency), 332, 344, 15, teal, true);
  text("RESUMEN DE LA OPERACIÓN", 40, 309, 9, teal, true);
  const rows = [
    ["Operación", t.demo_meta?.code || t.id],
    ["Monto entregado", money(t.amount, t.from_currency)],
    [
      "Tipo de cambio",
      `1 ${t.from_currency} = ${Number(t.rate).toLocaleString("es-PE", { maximumFractionDigits: 8 })} ${t.to_currency}`,
    ],
    ["Monto recibido", money(t.recipient_amount, t.to_currency)],
    ["Destinatario", t.recipient_name],
    ["Banco de destino", t.recipient_bank],
    ["Referencia del envío", t.payout_reference || "Sin referencia"],
  ];
  rows.forEach(([label, value], i) => {
    text(label, 40, 285 - i * 24, 9, muted);
    wrap(value, 190, 285 - i * 24, 365, 9, 1);
  });
  page.drawLine({
    start: { x: 40, y: 92 },
    end: { x: 555, y: 92 },
    color: rgb(0.83, 0.88, 0.88),
    thickness: 1,
  });
  text(
    fiscal?.beta
      ? "Documento emitido en SUNAT beta. No tiene validez tributaria."
      : brazil
        ? "Documento demo. Não representa uma NFS-e autorizada."
        : "Documento demo. No constituye un comprobante emitido ante SUNAT.",
    40,
    71,
    8,
    muted,
  );
  text(
    fiscal?.beta
      ? "Impuesto del 18% usado para el ensayo beta; no determina el tratamiento productivo."
      : brazil
        ? "Impostos não calculados nesta demonstração."
        : "Detalle de impuestos no determinado en esta demostración.",
    40,
    56,
    8,
    muted,
  );
  text("brasper.  |  1 / 1", 460, 40, 8, muted);
  return new Uint8Array(await pdf.save());
}
