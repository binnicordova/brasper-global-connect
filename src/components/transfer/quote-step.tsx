import { ArrowDownUp, ArrowRight, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useRates } from "@/hooks/use-brasper-data";
import { api } from "@/lib/api/client";
import { ApiError, messageForError } from "@/lib/api/errors";
import type { Quote } from "@/lib/api/types";
import { currencies, type Currency } from "@/lib/currency";
import type { ExchangeIntent } from "@/lib/exchange-intent";
import { formatMoney, formatRate, parseAmount } from "@/lib/money";
import { estimateQuote, minimumSend } from "@/lib/pricing";
import { whatsappLink } from "@/lib/whatsapp-link";

export function QuoteStep({
  initial,
  onQuote,
}: {
  initial: ExchangeIntent | null;
  onQuote: (quote: Quote) => void;
}) {
  const [from, setFrom] = useState<Currency>("PEN");
  const [to, setTo] = useState<Currency>("BRL");
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsPerson, setNeedsPerson] = useState(false);
  const rates = useRates();

  useEffect(() => {
    if (!initial) return;
    setFrom(initial.from);
    setTo(initial.to);
    setAmount(initial.amount);
  }, [initial]);

  const value = parseAmount(amount);
  const estimate = useMemo(
    () =>
      rates.data && value
        ? estimateQuote(rates.data.market, rates.data.pricing, {
            sendCurrency: from,
            receiveCurrency: to,
            sendAmount: value,
          })
        : null,
    [rates.data, value, from, to],
  );
  const minimum = rates.data ? minimumSend(rates.data.market, rates.data.pricing, from) : 0;
  const belowMinimum = !!value && !!minimum && value < minimum;

  const flip = () => {
    setFrom(to);
    setTo(from);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setNeedsPerson(false);
    try {
      onQuote(
        await api.createQuote({ sendCurrency: from, receiveCurrency: to, sendAmount: value }),
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "requires-human") setNeedsPerson(true);
      setError(messageForError(e));
    } finally {
      setBusy(false);
    }
  }

  const helpMessage = `Hola, Brasper. Quiero enviar ${formatMoney(value ?? 0, from)} de ${from} a ${to}. ¿Me ayudan con la tasa?`;

  return (
    <section className="portal-card" aria-labelledby="quote-title">
      <h2 id="quote-title">1. ¿Cuánto quieres enviar?</h2>
      <p>Calculamos tu cotización con la tasa del momento y la fijamos unos minutos para ti.</p>
      <form className="portal-form transfer-form" onSubmit={submit} noValidate>
        <label>
          Tú envías
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!value}
            required
          />
        </label>
        <label>
          Moneda que envías
          <select value={from} onChange={(e) => setFrom(e.target.value as Currency)}>
            {Object.entries(currencies).map(([code, c]) => (
              <option key={code} value={code} disabled={code === to}>
                {c.flag} {code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="wide swap-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Intercambiar monedas"
            onClick={flip}
          >
            <ArrowDownUp />
          </Button>
        </div>
        <label className="wide">
          Moneda que reciben
          <select value={to} onChange={(e) => setTo(e.target.value as Currency)}>
            {Object.entries(currencies).map(([code, c]) => (
              <option key={code} value={code} disabled={code === from}>
                {c.flag} {code} · {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="wide exchange-review" aria-live="polite">
          <h4>Estimado (puede variar al cotizar)</h4>
          {estimate ? (
            <dl>
              <div>
                <dt>Recibirían aproximadamente</dt>
                <dd>{formatMoney(estimate.receiveAmount, to)}</dd>
              </div>
              <div>
                <dt>Tasa Brasper estimada</dt>
                <dd>
                  1 {from} = {formatRate(estimate.rate)} {to}
                </dd>
              </div>
              <div>
                <dt>Comisión e impuesto estimados</dt>
                <dd>{formatMoney(estimate.commission + estimate.tax, from)}</dd>
              </div>
            </dl>
          ) : rates.isError ? (
            <p>
              No pudimos cargar la tasa de referencia. Aun así puedes cotizar: la tasa final la
              define la cotización.
            </p>
          ) : (
            <p>
              {rates.isLoading
                ? "Cargando tasa de referencia…"
                : "Ingresa un monto para ver el estimado."}
            </p>
          )}
        </div>

        {belowMinimum && (
          <p className="wide field-error" role="alert">
            El mínimo para enviar es {formatMoney(minimum, from)}.
          </p>
        )}
        {error && (
          <div className="wide portal-notice" role="alert">
            {error}
            {needsPerson && (
              <>
                {" "}
                <a
                  className="portal-whatsapp"
                  href={whatsappLink(helpMessage)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={16} /> Hablar con una persona
                </a>
              </>
            )}
          </div>
        )}
        <Button variant="brand" className="wide exchange-submit" disabled={!value || busy}>
          {busy ? "Cotizando…" : "Continuar"} <ArrowRight size={16} />
        </Button>
      </form>
    </section>
  );
}
