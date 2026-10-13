import { createFileRoute } from "@tanstack/react-router";
import { whatsappWebhook } from "@/lib/whatsapp/bridge.server";
export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: ({ request }) => whatsappWebhook(request),
      POST: ({ request }) => whatsappWebhook(request),
    },
  },
});
