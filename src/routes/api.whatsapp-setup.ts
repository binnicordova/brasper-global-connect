import { createFileRoute } from "@tanstack/react-router";
import { configureWhatsApp } from "@/lib/whatsapp/config.server";
export const Route = createFileRoute("/api/whatsapp-setup")({
  server: {
    handlers: {
      GET: ({ request }) => configureWhatsApp(request),
      POST: ({ request }) => configureWhatsApp(request),
    },
  },
});
