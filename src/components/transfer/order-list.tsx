import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyOrders } from "@/hooks/use-brasper-data";
import { formatLimaDateTime } from "@/lib/hours";
import { formatMoney } from "@/lib/money";
import { statusLabel } from "@/lib/orders";

export function OrderList({ onOpen }: { onOpen: (orderId: string) => void }) {
  const { orders, loading } = useMyOrders();
  if (loading || orders.length === 0) return null;
  return (
    <section className="portal-card" aria-labelledby="orders-title">
      <h2 id="orders-title">Mis transferencias</h2>
      <p>
        Tu acceso vive en este navegador. Anota el número de tu operación: si borras los datos del
        navegador o cambias de dispositivo, el equipo podrá ayudarte por WhatsApp.
      </p>
      <ul className="order-list">
        {orders.map((o) => (
          <li key={o.orderId}>
            <div>
              <strong>{o.orderId}</strong>
              <span>{formatLimaDateTime(new Date(o.createdAt))}</span>
            </div>
            <div>
              {formatMoney(o.sendAmount, o.sendCurrency)} →{" "}
              {formatMoney(o.receiveAmount, o.receiveCurrency)}
            </div>
            <span className="status-badge" data-status={o.status}>
              {statusLabel[o.status]}
            </span>
            <Button
              variant="outline"
              onClick={() => onOpen(o.orderId)}
              aria-label={`Abrir ${o.orderId}`}
            >
              Ver <ArrowRight size={16} />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
