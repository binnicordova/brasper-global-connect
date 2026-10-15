import { ArrowLeft, Download, MessageCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { OrderTimeline } from "@/components/transfer/order-timeline";
import { PaymentPanel } from "@/components/transfer/payment-panel";
import { Button } from "@/components/ui/button";
import { useOrder } from "@/hooks/use-brasper-data";
import { api } from "@/lib/api/client";
import { messageForError } from "@/lib/api/errors";
import { saveReceipt, maskAccount } from "@/lib/download";
import { formatLimaDateTime, isSupportOpen, nextVerificationSlot } from "@/lib/hours";
import { formatMoney, formatRate } from "@/lib/money";
import { isReceiptReady, statusLabel } from "@/lib/orders";
import { whatsappLink } from "@/lib/whatsapp-link";

export function OrderPanel({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { data: order, isLoading, isError, isFetching, refetch } = useOrder(orderId);
  const [receiptError, setReceiptError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const back = (
    <Button type="button" variant="outline" onClick={onBack}>
      <ArrowLeft size={16} /> Mis transferencias
    </Button>
  );

  if (isLoading) return <p role="status">Cargando tu operación…</p>;
  if (isError || !order)
    return (
      <section className="portal-card">
        <h2>No pudimos abrir {orderId}</h2>
        <p>
          {isError
            ? "Revisa tu conexión e inténtalo otra vez."
            : "Esta operación no pertenece a este navegador. Si la creaste desde otro dispositivo, escríbenos por WhatsApp."}
        </p>
        <div className="exchange-navigation">
          {back}
          {isError && (
            <Button variant="brand" onClick={() => void refetch()}>
              <RefreshCw size={16} /> Reintentar
            </Button>
          )}
        </div>
      </section>
    );

  async function downloadReceipt() {
    setDownloading(true);
    setReceiptError("");
    try {
      saveReceipt(await api.getReceipt(orderId));
    } catch (e) {
      setReceiptError(messageForError(e));
    } finally {
      setDownloading(false);
    }
  }

  const now = new Date();
  return (
    <>
      <section className="portal-card" aria-labelledby="order-title">
        <div className="order-head">
          <div>
            <span className="section-kicker">Operación</span>
            <h2 id="order-title">{order.orderId}</h2>
          </div>
          <span className="status-badge" data-status={order.status}>
            {statusLabel[order.status]}
          </span>
        </div>
        <OrderTimeline order={order} />
        <div className="exchange-review">
          <dl>
            <div>
              <dt>Envías</dt>
              <dd>{formatMoney(order.sendAmount, order.sendCurrency)}</dd>
            </div>
            <div>
              <dt>Total transferido</dt>
              <dd>{formatMoney(order.total, order.sendCurrency)}</dd>
            </div>
            <div>
              <dt>Tasa fijada</dt>
              <dd>
                1 {order.sendCurrency} = {formatRate(order.rate)} {order.receiveCurrency}
              </dd>
            </div>
            <div>
              <dt>Reciben</dt>
              <dd>{formatMoney(order.receiveAmount, order.receiveCurrency)}</dd>
            </div>
            <div>
              <dt>Cuenta de destino</dt>
              <dd>
                {order.destinationBank} {maskAccount(order.destinationAccount)}
              </dd>
            </div>
            {order.operationNo && (
              <div>
                <dt>N.º de operación</dt>
                <dd>{order.operationNo}</dd>
              </div>
            )}
          </dl>
        </div>

        {order.status === "validating" && (
          <div className="portal-notice" role="status">
            Recibimos tu comprobante. Una persona del equipo está verificando el ingreso en el
            banco.
            {!isSupportOpen(now) &&
              ` Revisamos pagos en horario de Lima; lo veremos desde ${formatLimaDateTime(nextVerificationSlot(now))}`}
          </div>
        )}
        {order.status === "rejected" && (
          <div className="portal-notice" role="alert">
            No pudimos validar tu pago{order.rejectionReason ? `: ${order.rejectionReason}` : "."}{" "}
            <a
              href={whatsappLink(`Hola, Brasper. Mi operación ${order.orderId} fue rechazada.`)}
              target="_blank"
              rel="noreferrer"
            >
              Escríbenos por WhatsApp
            </a>
            .
          </div>
        )}
        {order.status === "cancelled" && (
          <p>Cancelaste esta operación. Puedes crear una nueva cuando quieras.</p>
        )}
        {order.status === "approved" && <p>Confirmamos tu pago. Estamos preparando el envío.</p>}
        {order.status === "exported" && !isReceiptReady(order.invoiceStatus) && (
          <p>Tu dinero ya está en camino. El comprobante aparecerá aquí cuando esté listo.</p>
        )}
        {order.status === "exported" && isReceiptReady(order.invoiceStatus) && (
          <div className="receipt-box">
            <Button variant="brand" disabled={downloading} onClick={() => void downloadReceipt()}>
              <Download size={16} /> {downloading ? "Preparando…" : "Descargar comprobante"}
            </Button>
            <p>Comprobante de prueba: aún no tiene validez tributaria.</p>
            {receiptError && (
              <div className="portal-notice" role="alert">
                {receiptError}
              </div>
            )}
          </div>
        )}

        <div className="exchange-navigation">
          {back}
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw size={16} /> Actualizar
          </Button>
          {order.status !== "pending" && (
            <Button variant="outline" asChild>
              <a
                href={whatsappLink(`Hola, Brasper. Consulta sobre mi operación ${order.orderId}.`)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={16} /> WhatsApp
              </a>
            </Button>
          )}
        </div>
      </section>
      {order.status === "pending" && <PaymentPanel order={order} />}
    </>
  );
}
