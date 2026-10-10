import { createFileRoute } from "@tanstack/react-router";
import { handleBetaBilling } from "@/lib/billing-beta-gateway.server";
export const Route = createFileRoute("/api/billing-beta")({
  server: { handlers: { POST: ({ request }) => handleBetaBilling(request) } },
});
