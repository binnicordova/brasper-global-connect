import type { InvoiceStatus, Order, OrderStatus } from "@/lib/api/types";

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Esperando tu pago",
  validating: "Pago en revisión",
  approved: "Pago confirmado",
  exported: "Dinero enviado",
  rejected: "Pago rechazado",
  cancelled: "Cancelada",
};

export const isOpenOrder = (status: OrderStatus) => status === "pending" || status === "validating";

export const isReceiptReady = (invoiceStatus: InvoiceStatus | null | undefined) =>
  invoiceStatus === "accepted" || invoiceStatus === "sent";

/** Nothing else will change on the order: stop polling. */
export const isSettled = (order: Pick<Order, "status" | "invoiceStatus">) =>
  order.status === "rejected" ||
  order.status === "cancelled" ||
  (order.status === "exported" && isReceiptReady(order.invoiceStatus));

export type StepState = "done" | "active" | "todo" | "failed";
export type TimelineStep = {
  key: "registered" | "verifying" | "sent" | "received";
  state: StepState;
};

export const stepLabel: Record<TimelineStep["key"], string> = {
  registered: "Solicitud registrada",
  verifying: "Pago en revisión",
  sent: "Dinero enviado",
  received: "Comprobante disponible",
};

/** Client-facing progress, derived from the order exactly as the backend documents it. */
export function timelineFor(order: Pick<Order, "status" | "invoiceStatus">): TimelineStep[] {
  const { status, invoiceStatus } = order;
  const failed = status === "rejected" || status === "cancelled";
  const confirmed = status === "approved" || status === "exported";
  return [
    { key: "registered", state: "done" },
    {
      key: "verifying",
      state: failed ? "failed" : status === "validating" ? "active" : confirmed ? "done" : "todo",
    },
    { key: "sent", state: confirmed ? "done" : "todo" },
    {
      key: "received",
      state: isReceiptReady(invoiceStatus) ? "done" : status === "exported" ? "active" : "todo",
    },
  ];
}
