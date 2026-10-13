import { createFileRoute } from "@tanstack/react-router";
import { configureLocalKey } from "@/lib/assistant/local-config.server";
export const Route = createFileRoute("/api/assistant-setup")({
  server: { handlers: { POST: ({ request }) => configureLocalKey(request) } },
});
