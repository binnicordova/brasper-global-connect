import { createFileRoute } from "@tanstack/react-router";
import { webSession } from "@/lib/whatsapp/web-session.server";
export const Route = createFileRoute("/api/whatsapp-web")({
  server: {
    handlers: {
      GET: ({ request }) => webSession(request),
      POST: ({ request }) => webSession(request),
    },
  },
});
