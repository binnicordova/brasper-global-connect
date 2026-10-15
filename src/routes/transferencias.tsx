import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { DetailsStep } from "@/components/transfer/details-step";
import { OrderList } from "@/components/transfer/order-list";
import { OrderPanel } from "@/components/transfer/order-panel";
import { QuoteStep } from "@/components/transfer/quote-step";
import { useRefreshOrders } from "@/hooks/use-brasper-data";
import type { Quote } from "@/lib/api/types";
import { readExchangeIntent, type ExchangeIntent } from "@/lib/exchange-intent";
import { activeQuote, forgetQuote, rememberQuote } from "@/lib/local-data";

export const Route = createFileRoute("/transferencias")({
  component: TransferPortal,
  head: () => ({ meta: [{ title: "Mis transferencias | Brasper" }] }),
});

function TransferPortal() {
  const [intent, setIntent] = useState<ExchangeIntent | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const refresh = useRefreshOrders();

  // Browser-only state is read after mount so the server and first client render match.
  useEffect(() => {
    setIntent(readExchangeIntent(window.location.search));
    setQuote(activeQuote());
  }, []);

  const startOver = () => {
    forgetQuote();
    setQuote(null);
  };

  return (
    <div className="portal-page">
      <header className="wrap portal-header">
        <Link to="/" className="brand" aria-label="Brasper, inicio">
          <span className="brand-mark" aria-hidden="true" />
          brasper<span className="text-primary">.</span>
        </Link>
        <Link to="/" className="portal-back">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
      </header>
      <main className="wrap portal-main">
        <div className="portal-heading">
          <span className="section-kicker">Tu dinero, paso a paso</span>
          <h1>Tus transferencias, en un solo lugar</h1>
          <p>Cotiza, registra el destino, paga y sigue la revisión de tu operación.</p>
        </div>
        {orderId ? (
          <OrderPanel orderId={orderId} onBack={() => setOrderId(null)} />
        ) : (
          <>
            {quote ? (
              <DetailsStep
                quote={quote}
                onBack={startOver}
                onExpired={startOver}
                onCreated={(order) => {
                  forgetQuote();
                  setQuote(null);
                  setOrderId(order.orderId);
                  void refresh();
                }}
              />
            ) : (
              <QuoteStep
                initial={intent}
                onQuote={(q) => {
                  rememberQuote(q);
                  setQuote(q);
                }}
              />
            )}
            <OrderList onOpen={setOrderId} />
          </>
        )}
      </main>
    </div>
  );
}
