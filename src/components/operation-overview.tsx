import { ArrowRight, ArrowLeftRight, CalendarDays, Landmark, Users } from "lucide-react";
import {
  billingTypeLabels,
  accountTypeLabels,
  identityDocumentLabels,
  type Transfer,
} from "@/lib/transfers";
const money = (value: number, currency: string) =>
  Number.isFinite(Number(value))
    ? `${Number(value).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    : "No registrado";
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Pendiente";
export function OperationOverview({ transfer: t }: { transfer: Transfer }) {
  return (
    <div className="ops-overview">
      <div className="ops-exchange-total">
        <div>
          <span>El cliente envía</span>
          <strong>{money(t.amount, t.from_currency)}</strong>
        </div>
        <ArrowRight size={24} aria-hidden="true" />
        <div>
          <span>El destinatario recibe</span>
          <strong>{money(t.recipient_amount, t.to_currency)}</strong>
        </div>
      </div>
      <div className="ops-detail-grid">
        <section className="ops-detail-card">
          <h3>
            <Users size={16} /> Participantes
          </h3>
          <dl>
            {t.demo_meta && (
              <div>
                <dt>Asesor demo</dt>
                <dd>{t.demo_meta.advisor}</dd>
              </div>
            )}
            <div>
              <dt>Cliente</dt>
              <dd>{t.customer_name}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>
                {identityDocumentLabels[t.customer_document_type || ""]}{" "}
                {t.customer_document || "No registrado"}
              </dd>
            </div>
            <div>
              <dt>Destinatario</dt>
              <dd>{t.recipient_name}</dd>
            </div>
            <div>
              <dt>Banco de origen</dt>
              <dd>{t.origin_bank || "No registrado"}</dd>
            </div>
            <div>
              <dt>Relación declarada</dt>
              <dd>{t.recipient_relationship || "No registrada"}</dd>
            </div>
          </dl>
        </section>
        <section className="ops-detail-card tint">
          <h3>
            <ArrowLeftRight size={16} /> Condiciones aplicadas
          </h3>
          <dl>
            <div>
              <dt>Tipo de cambio</dt>
              <dd>
                {Number.isFinite(Number(t.rate))
                  ? `1 ${t.from_currency} = ${Number(t.rate).toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${t.to_currency}`
                  : "No registrado"}
              </dd>
            </div>
            <div>
              <dt>Comisión incluida</dt>
              <dd>{money(t.commission, t.from_currency)}</dd>
            </div>
            <div>
              <dt>Monto neto convertido</dt>
              <dd>
                {Number.isFinite(Number(t.commission))
                  ? money(Number(t.amount) - Number(t.commission), t.from_currency)
                  : "No registrado"}
              </dd>
            </div>
            <div>
              <dt>Comprobante solicitado</dt>
              <dd>{billingTypeLabels[t.billing_type || "factura"]}</dd>
            </div>
            <div>
              <dt>Receptor fiscal</dt>
              <dd>{t.billing_name || t.customer_name}</dd>
            </div>
            {t.demo_meta && (
              <div>
                <dt>Empresa emisora demo</dt>
                <dd>{t.demo_meta.issuer}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="ops-detail-card">
          <h3>
            <Landmark size={16} /> Cuenta de destino
          </h3>
          <dl>
            <div>
              <dt>Banco</dt>
              <dd>{t.recipient_bank}</dd>
            </div>
            <div>
              <dt>Titular</dt>
              <dd>{t.recipient_account_holder || t.recipient_name}</dd>
            </div>
            <div>
              <dt>Tipo de cuenta</dt>
              <dd>{accountTypeLabels[t.recipient_account_type || "bank_account"]}</dd>
            </div>
            <div>
              <dt>Cuenta / clave</dt>
              <dd>{t.recipient_account}</dd>
            </div>
            <div>
              <dt>Referencia del ingreso</dt>
              <dd>{t.deposit_bank_reference || "Pendiente"}</dd>
            </div>
          </dl>
        </section>
        <section className="ops-detail-card">
          <h3>
            <CalendarDays size={16} /> Fechas y seguimiento
          </h3>
          <dl>
            <div>
              <dt>Solicitud creada</dt>
              <dd>{date(t.created_at)}</dd>
            </div>
            <div>
              <dt>Ingreso confirmado</dt>
              <dd>{date(t.verified_at)}</dd>
            </div>
            <div>
              <dt>Dinero enviado</dt>
              <dd>{date(t.payout_at)}</dd>
            </div>
            <div>
              <dt>Última actualización</dt>
              <dd>{date(t.updated_at)}</dd>
            </div>
            <div>
              <dt>Referencia del envío</dt>
              <dd>{t.payout_reference || "Pendiente"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
