import { Clock } from "lucide-react";
import { formatCountdown, useCountdown } from "@/hooks/use-brasper-data";
import type { Quote } from "@/lib/api/types";
import { formatMoney, formatRate } from "@/lib/money";

/** The binding quote returned by the server, with the time left to use its frozen rate. */
export function QuoteSummary({ quote }: { quote: Quote }) {
  const left = useCountdown(quote.expiresAt);
  const expired = left === 0;
  return (
    <div className="exchange-review" aria-label="Tu cotización">
      <h4>Tu cotización</h4>
      <dl>
        <div>
          <dt>Tú envías</dt>
          <dd>{formatMoney(quote.sendAmount, quote.sendCurrency)}</dd>
        </div>
        <div>
          <dt>Tasa Brasper</dt>
          <dd>
            1 {quote.sendCurrency} = {formatRate(quote.rate)} {quote.receiveCurrency}
          </dd>
        </div>
        <div>
          <dt>Comisión</dt>
          <dd>{formatMoney(quote.commission, quote.sendCurrency)}</dd>
        </div>
        <div>
          <dt>Impuesto sobre la comisión</dt>
          <dd>{formatMoney(quote.tax, quote.sendCurrency)}</dd>
        </div>
        <div>
          <dt>Total que transferirás</dt>
          <dd>{formatMoney(quote.total, quote.sendCurrency)}</dd>
        </div>
        <div>
          <dt>Reciben</dt>
          <dd>{formatMoney(quote.receiveAmount, quote.receiveCurrency)}</dd>
        </div>
      </dl>
      <p className={`quote-countdown${expired ? " expired" : ""}`} role="timer">
        <Clock size={14} />{" "}
        {left === null
          ? "Tasa garantizada por unos minutos"
          : expired
            ? "La cotización venció"
            : `Tasa garantizada ${formatCountdown(left)} más`}
      </p>
    </div>
  );
}
