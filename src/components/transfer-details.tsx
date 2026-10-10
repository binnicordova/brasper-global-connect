import { accountTypeLabels, type Transfer } from "@/lib/transfers";
export function TransferDetails({ transfer: t }: { transfer: Transfer }) {
  return (
    <div className="transfer-details">
      <h4>Datos del remitente</h4>
      <dl>
        <div>
          <dt>Nombre</dt>
          <dd>{t.customer_name}</dd>
        </div>
        <div>
          <dt>Documento</dt>
          <dd>{t.customer_document}</dd>
        </div>
        <div>
          <dt>Correo</dt>
          <dd>
            {t.customer_email}
            {t.customer_email_verified === false && <small> · Contacto sin verificar</small>}
          </dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{t.customer_phone || "No registrado"}</dd>
        </div>
      </dl>
      <h4>Destinatario y cuenta receptora</h4>
      <dl>
        <div>
          <dt>Destinatario</dt>
          <dd>{t.recipient_name}</dd>
        </div>
        <div>
          <dt>Documento</dt>
          <dd>{t.recipient_document}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{t.recipient_phone || "No registrado"}</dd>
        </div>
        <div>
          <dt>Titular de la cuenta</dt>
          <dd>{t.recipient_account_holder || t.recipient_name}</dd>
        </div>
        <div>
          <dt>Documento del titular</dt>
          <dd>{t.recipient_account_holder_document || t.recipient_document}</dd>
        </div>
        <div>
          <dt>Banco</dt>
          <dd>{t.recipient_bank}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{accountTypeLabels[t.recipient_account_type || "bank_account"]}</dd>
        </div>
        <div>
          <dt>Cuenta / clave</dt>
          <dd>{t.recipient_account}</dd>
        </div>
        <div>
          <dt>Moneda de destino</dt>
          <dd>{t.to_currency}</dd>
        </div>
        {t.recipient_bank_branch && (
          <div>
            <dt>Agencia / sucursal</dt>
            <dd>{t.recipient_bank_branch}</dd>
          </div>
        )}
      </dl>
      {t.transfer_note && (
        <div className="transfer-notes">
          <h4>Información adicional</h4>
          <p>{t.transfer_note}</p>
        </div>
      )}
    </div>
  );
}
