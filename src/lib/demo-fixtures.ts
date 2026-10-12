import { quoteAmounts, type Transfer } from "./transfers";

export const STAFF = "00000000-0000-4000-8000-000000000901";
export const CLIENT = "00000000-0000-4000-8000-000000000902";
export const RATE = "00000000-0000-4000-8000-000000000903";
type Event = { transfer_id: string; action: string; note: string; created_at: string };
type DemoTransfer = Transfer & { user_id: string };
import type { SavedRecipient } from "./saved-recipients";
export type DemoState = {
  savedRecipients?: SavedRecipient[];
  transfers: DemoTransfer[];
  events: Event[];
  nextInvoice?: number;
};

export function createDemoFixtures(anchor = Date.now()): DemoState {
  const names = [
    "Camila Torres Mendoza",
    "Lucas Almeida Costa",
    "Valeria Rojas Salazar",
    "Rafael Oliveira Santos",
    "Mariana Vega Castillo",
    "Gabriel Ferreira Lima",
  ];
  const recipients = [
    "Beatriz Almeida Costa",
    "Diego Torres Mendoza",
    "Andrés Rojas Salazar",
    "Fernanda Oliveira Santos",
    "Lucía Vega Castillo",
    "Thiago Ferreira Lima",
  ];
  const transfers = names.map((name, i): DemoTransfer => {
    const amount = [300, 500, 200, 850, 1500, 280][i]!;
    const brazil = i === 0 || i === 3;
    const route = demoRates(anchor)[brazil ? 0 : 1]!;
    const q = quoteAmounts(amount, route.rate, route.commission_percent);
    const status = [
      "proof_submitted",
      "proof_submitted",
      "verified",
      "awaiting_payment",
      "completed",
      "paid_out",
    ][i]!;
    const id = `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000000`;
    const created = new Date(anchor - (i + 1) * 3600000).toISOString();
    return {
      id,
      user_id: CLIENT,
      demo_meta: {
        code: `BRS-${String(i + 1).padStart(6, "0")}`,
        advisor: i % 2 ? "Sofía Navarro" : "Diego Martins",
        issuer: brazil ? "Brasper · Brasil" : "Brasper · Perú",
      },
      amount,
      commission: q.commission,
      recipient_amount: q.received,
      rate: route.rate,
      from_currency: route.from_currency,
      to_currency: route.to_currency,
      customer_name: name,
      customer_document: `1234500${i}`,
      customer_document_type: "1",
      customer_phone: "+51900000000",
      customer_email: `cliente${i + 1}@example.test`,
      customer_email_verified: false,
      billing_type: brazil ? "nfse" : i === 4 ? "factura" : "boleta",
      billing_country: brazil ? "BR" : "PE",
      billing_email: `cliente${i + 1}@example.test`,
      billing_name: i === 4 ? "Comercial Horizonte S.A.C." : name,
      billing_document: i === 4 ? "20999999999" : `1234500${i}`,
      billing_document_type: brazil ? "foreign" : i === 4 ? "6" : "1",
      recipient_name: recipients[i]!,
      recipient_document: `8765400${i}`,
      recipient_bank: brazil ? "Banco de destino · Brasil" : "Banco de destino · Perú",
      recipient_account: `destino${i + 1}@example.test`,
      recipient_account_type: brazil ? "pix" : "bank_account",
      recipient_account_holder: recipients[i]!,
      recipient_account_holder_document: `1234567890${i}`,
      recipient_relationship: "Familia",
      origin_bank: brazil ? "Banco de destino · Perú" : "Banco de destino · Brasil",
      source_country: brazil ? "PE" : "BR",
      destination_country: brazil ? "BR" : "PE",
      funds_origin: "savings",
      funds_detail: "Ahorros personales",
      transfer_purpose: "Apoyo a mi familia",
      status,
      deposit_instructions: [
        {
          bank: brazil ? "Banco de destino · Perú" : "Banco de destino · Brasil",
          holder: "Brasper",
          account_number: "CUENTA-DE-PRUEBA",
          instructions: "Cuenta de prueba para presentación. No realizar depósitos.",
        },
      ],
      proof_path: status === "awaiting_payment" ? null : `${CLIENT}/${id}/deposit/demo.jpg`,
      payout_path: ["completed", "paid_out"].includes(status)
        ? `${STAFF}/${id}/payout/demo.jpg`
        : null,
      payout_reference: ["completed", "paid_out"].includes(status)
        ? `ENV-${String(i + 1).padStart(8, "0")}`
        : null,
      deposit_bank_reference:
        status === "awaiting_payment" ? null : `ING-${String(i + 1).padStart(8, "0")}`,
      created_at: created,
      updated_at: created,
      verified_at: ["verified", "completed", "paid_out"].includes(status) ? created : null,
      payout_at: ["completed", "paid_out"].includes(status) ? created : null,
      invoices:
        status === "completed"
          ? [
              {
                issuer_country: brazil ? "BR" : "PE",
                document_type: brazil ? "NFSE" : "01",
                status: "demo_delivered",
                environment: "demo",
                number: "VP-000001",
                pdf_path: `${CLIENT}/${id}/invoice/DEMO-000001.pdf`,
                xml_path: null,
                cdr_path: null,
                error: null,
                demo_email: `cliente${i + 1}@example.test`,
                demo_delivered_at: created,
              },
            ]
          : status === "paid_out"
            ? [
                {
                  issuer_country: brazil ? "BR" : "PE",
                  document_type: brazil ? "NFSE" : "03",
                  status: "blocked",
                  environment: "demo",
                  number: null,
                  pdf_path: null,
                  xml_path: null,
                  cdr_path: null,
                  error: "Revisar los datos fiscales del receptor.",
                },
              ]
            : [],
    };
  });
  const events: Event[] = [];
  for (const t of transfers) {
    const stages = [{ action: "Solicitud registrada", minute: 0 }];
    if (t.proof_path) stages.push({ action: "Prueba de ingreso adjuntada", minute: 2 });
    if (t.verified_at) stages.push({ action: "Ingreso confirmado", minute: 5 });
    if (t.payout_at) stages.push({ action: "Envío registrado", minute: 10 });
    if (t.status === "completed")
      stages.push(
        { action: "Comprobante preparado", minute: 14 },
        { action: "Entrega preparada", minute: 15 },
      );
    const at = (minute: number) =>
      new Date(Date.parse(t.created_at) + minute * 60000).toISOString();
    if (t.verified_at) t.verified_at = at(5);
    if (t.payout_at) t.payout_at = at(10);
    t.updated_at = at(stages.at(-1)!.minute);
    if (t.invoices?.[0]?.demo_delivered_at) t.invoices[0].demo_delivered_at = at(15);
    for (const stage of stages)
      events.push({
        transfer_id: t.id,
        action: stage.action,
        note: "Registro de presentación",
        created_at: at(stage.minute),
      });
  }
  return {
    transfers,
    events: events.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    nextInvoice: 2,
  };
}

export const demoRates = (anchor = Date.now()) => [
  {
    id: RATE,
    from_currency: "PEN",
    to_currency: "BRL",
    rate: 1.425,
    commission_percent: 5,
    min_amount: 1,
    max_amount: 100000,
    active: true,
    valid_until: new Date(anchor + 86400000).toISOString(),
  },
  {
    id: "00000000-0000-4000-8000-000000000904",
    from_currency: "BRL",
    to_currency: "PEN",
    rate: 0.69,
    commission_percent: 3,
    min_amount: 1,
    max_amount: 100000,
    active: true,
    valid_until: new Date(anchor + 86400000).toISOString(),
  },
];
