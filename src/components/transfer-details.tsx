import {
  countryLabels,
  fundsOriginLabels,
  identityDocumentLabels,
  accountTypeLabels,
  billingTypeLabels,
  billingDocumentLabels,
  type Transfer,
} from "@/lib/transfers";
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
          <dd>
            {t.customer_document_type && `${identityDocumentLabels[t.customer_document_type]} · `}
            {t.customer_document}
          </dd>
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
      {t.source_country && (
        <>
          <h4>Ingreso bancario y declaración de fondos</h4>
          <dl>
            <div>
              <dt>Banco de origen</dt>
              <dd>{t.origin_bank || "No registrado"}</dd>
            </div>
            <div>
              <dt>País de origen / recepción</dt>
              <dd>
                {countryLabels[t.source_country]} / {countryLabels[t.destination_country || ""]}
              </dd>
            </div>
            <div>
              <dt>Número de operación del ingreso</dt>
              <dd>{t.deposit_bank_reference || "Pendiente de adjuntar el pago"}</dd>
            </div>
            {(t.source_country === "PE" || t.destination_country === "PE") && (
              <>
                <div>
                  <dt>Origen de fondos</dt>
                  <dd>{fundsOriginLabels[t.funds_origin || ""] || "No declarado"}</dd>
                </div>
                {t.funds_detail && (
                  <div>
                    <dt>Detalle del origen</dt>
                    <dd>{t.funds_detail}</dd>
                  </div>
                )}
                <div>
                  <dt>Motivo del cambio</dt>
                  <dd>{t.transfer_purpose || "No declarado"}</dd>
                </div>
              </>
            )}
            {t.recipient_relationship && (
              <div>
                <dt>Relación con el destinatario / titular</dt>
                <dd>{t.recipient_relationship}</dd>
              </div>
            )}
          </dl>
          <p>
            Datos declarados por el cliente. Verificar identidad, titularidad e ingreso bancario
            antes de aprobar.
          </p>
        </>
      )}
      <h4>Datos del comprobante</h4>
      <dl>
        <div>
          <dt>Tipo de comprobante</dt>
          <dd>{billingTypeLabels[t.billing_type || "factura"]}</dd>
        </div>
        <div>
          <dt>Correo de entrega</dt>
          <dd>
            {t.billing_email || t.customer_email}
            {t.billing_email_verified === false && <small> · Pendiente de confirmar</small>}
          </dd>
        </div>
        <div>
          <dt>Receptor del comprobante</dt>
          <dd>{t.billing_name || t.customer_name}</dd>
        </div>
        <div>
          <dt>Documento del receptor</dt>
          <dd>
            {t.billing_document_type && `${billingDocumentLabels[t.billing_document_type]} · `}
            {t.billing_document || t.customer_document}
          </dd>
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
