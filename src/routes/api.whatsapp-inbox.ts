import { createFileRoute } from "@tanstack/react-router";
import { inbox } from "@/lib/whatsapp/bridge.server";
export const Route = createFileRoute("/api/whatsapp-inbox")({
  server: {
    handlers: { GET: ({ request }) => inbox(request), POST: ({ request }) => inbox(request) },
  },
});
