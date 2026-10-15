import { Check, Copy, MessageCircle, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { formatCountdown, useCountdown, useRefreshOrders } from "@/hooks/use-brasper-data";
import { api } from "@/lib/api/client";
import { messageForError } from "@/lib/api/errors";
import { checkProofFile, uploadProof } from "@/lib/api/proof";
import type { Order } from "@/lib/api/types";
import { formatMoney } from "@/lib/money";
import { isValidOperationNo } from "@/lib/validators";
import { whatsappLink } from "@/lib/whatsapp-link";

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-chip"
      aria-label={`Copiar ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

/** Step 3: where to pay, then "I paid" with the bank operation number and the proof photo. */
export function PaymentPanel({ order }: { order: Order }) {
  const { paymentAccount: account } = order;
  const left = useCountdown(order.rateLockedUntil);
  const refresh = useRefreshOrders();
  const [operationNo, setOperationNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isValidOperationNo(operationNo))
      return setError("El número de operación debe tener entre 4 y 24 letras, números o guiones.");
    if (!file) return setError("Adjunta la foto o el PDF de tu comprobante.");
    const invalid = checkProofFile(file);
    if (invalid) return setError(messageForError(invalid));
    setBusy(true);
    setError("");
    try {
      const proofPath = await uploadProof(order.orderId, file);
      await api.submitProof({ orderId: order.orderId, operationNo: operationNo.trim(), proofPath });
      await refresh(order.orderId);
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm("¿Cancelar esta operación? Si ya pagaste, no canceles: escríbenos."))
      return;
    setCancelling(true);
    setError("");
    try {
      await api.cancelOrder(order.orderId);
      await refresh(order.orderId);
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="portal-card" aria-labelledby="pay-title">
      <h2 id="pay-title">3. Paga y sube tu comprobante</h2>
      <div className="pay-box">
        <p>
          Transfiere exactamente <strong>{formatMoney(order.total, order.sendCurrency)}</strong> a
          esta cuenta de Brasper:
        </p>
        {account.demo && (
          <p className="portal-notice" role="note">
            Esta es una cuenta de demostración. No transfieras dinero real hasta que Brasper
            confirme sus cuentas oficiales.
          </p>
        )}
        <dl>
          <div>
            <dt>Banco</dt>
            <dd>{account.bank}</dd>
          </div>
          <div>
            <dt>Titular</dt>
            <dd>{account.holder}</dd>
          </div>
          <div>
            <dt>Cuenta</dt>
            <dd>
              {account.accountNumber}{" "}
              <CopyValue label="número de cuenta" value={account.accountNumber} />
            </dd>
          </div>
          {account.pixKey && (
            <div>
              <dt>Clave PIX</dt>
              <dd>
                {account.pixKey} <CopyValue label="clave PIX" value={account.pixKey} />
              </dd>
            </div>
          )}
        </dl>
        <p className={`quote-countdown${left === 0 ? " expired" : ""}`} role="timer">
          {left === null
            ? "Tasa garantizada por tiempo limitado"
            : left > 0
              ? `Tasa garantizada ${formatCountdown(left)} más`
              : "La garantía de tasa venció. Escríbenos para confirmar tu operación."}
        </p>
      </div>

      <form className="portal-form" onSubmit={submit} noValidate>
        <label>
          Número de operación del banco
          <input
            value={operationNo}
            onChange={(e) => setOperationNo(e.target.value)}
            maxLength={24}
            autoComplete="off"
            required
          />
        </label>
        <label>
          Comprobante (imagen o PDF, hasta 8 MB)
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        {error && (
          <div className="portal-notice" role="alert">
            {error}
          </div>
        )}
        <Button variant="brand" disabled={busy || cancelling}>
          <Upload size={16} /> {busy ? "Enviando…" : "Ya pagué, enviar comprobante"}
        </Button>
      </form>

      <div className="exchange-navigation">
        <Button type="button" variant="outline" disabled={busy || cancelling} onClick={cancel}>
          {cancelling ? "Cancelando…" : "Cancelar operación"}
        </Button>
        <Button variant="outline" asChild>
          <a
            href={whatsappLink(`Hola, Brasper. Necesito ayuda con mi operación ${order.orderId}.`)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={16} /> Ayuda por WhatsApp
          </a>
        </Button>
      </div>
    </section>
  );
}
