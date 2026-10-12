import { billingState } from "@/lib/billing";
import type { Invoice } from "@/lib/transfers";
export function BillingStatus({
  invoice,
  details = false,
}: {
  invoice: Invoice | null;
  details?: boolean;
}) {
  const state = billingState(invoice);
  return (
    <span className="billing-status-group">
      <span
        className={`ops-fiscal billing-tone-${state.tone}`}
        title={details ? state.hint : state.label + " · " + state.delivery}
      >
        <span aria-hidden="true">●</span> {state.label}
      </span>
      <small>{state.delivery}</small>
    </span>
  );
}
