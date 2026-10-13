import { supabase as cloudClient } from "@/integrations/supabase/client";
import { hostedWhatsappToken } from "./hosted-whatsapp";
import { createDemoClient, isDemoEnabled } from "./demo-supabase";
export const supabase =
  isDemoEnabled() && !(typeof window !== "undefined" && hostedWhatsappToken(window.location.search))
    ? createDemoClient()
    : cloudClient;
