import { Check, Circle, Loader2, X } from "lucide-react";
import type { Order } from "@/lib/api/types";
import { stepLabel, timelineFor } from "@/lib/orders";

const icon = {
  done: <Check size={14} />,
  active: <Loader2 size={14} className="animate-spin" />,
  todo: <Circle size={10} />,
  failed: <X size={14} />,
};

export function OrderTimeline({ order }: { order: Pick<Order, "status" | "invoiceStatus"> }) {
  return (
    <ol className="order-timeline" aria-label="Progreso de tu operación">
      {timelineFor(order).map((step) => (
        <li key={step.key} data-state={step.state}>
          <span aria-hidden="true">{icon[step.state]}</span>
          <strong>{stepLabel[step.key]}</strong>
          <span className="sr-only">
            {
              { done: "completado", active: "en curso", todo: "pendiente", failed: "con problema" }[
                step.state
              ]
            }
          </span>
        </li>
      ))}
    </ol>
  );
}
