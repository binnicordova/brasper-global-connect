import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { fetchMyOrders, fetchOrder } from "@/lib/api/firestore";
import { cacheOrders, cachedOrders, summarize, type OrderSummary } from "@/lib/local-data";
import { storedSession } from "@/lib/api/session";
import { isSettled } from "@/lib/orders";

const ORDER_POLL_MS = 15_000;

/** Market reference + pricing, refreshed by the server hourly. Used for estimates only. */
export function useRates() {
  return useQuery({
    queryKey: ["rates"],
    queryFn: api.getRates,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** One order, followed live: polls while it can still change and the tab is visible. */
export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const order = await fetchOrder(orderId);
      const session = storedSession();
      if (order && session) cacheOrders(session.uid, [order]);
      return order;
    },
    refetchInterval: (query) => {
      const order = query.state.data;
      return order && isSettled(order) ? false : ORDER_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}

/**
 * The client's orders: the local summary first (instant, works offline), then the backend list.
 * Local reads happen after mount so server and client render the same markup.
 */
export function useMyOrders() {
  const [local, setLocal] = useState<OrderSummary[]>([]);
  useEffect(() => {
    const session = storedSession();
    if (session) setLocal(cachedOrders(session.uid));
  }, []);

  const remote = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const orders = await fetchMyOrders();
      const session = storedSession();
      if (session) cacheOrders(session.uid, orders);
      return orders.map(summarize);
    },
    retry: 1,
  });

  return {
    orders: remote.data ?? local,
    loading: remote.isLoading && local.length === 0,
    error: remote.error,
  };
}

/** Refetch helpers so a mutation can refresh both the open order and the list. */
export function useRefreshOrders() {
  const client = useQueryClient();
  return useCallback(
    async (orderId?: string) => {
      await Promise.all([
        orderId ? client.invalidateQueries({ queryKey: ["order", orderId] }) : null,
        client.invalidateQueries({ queryKey: ["my-orders"] }),
      ]);
    },
    [client],
  );
}

/** Milliseconds left until `iso`, ticking every second; `null` before the first client render. */
export function useCountdown(iso: string | null | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return setLeft(null);
    const tick = () => setLeft(Math.max(0, Date.parse(iso) - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  return left;
}

export const formatCountdown = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
