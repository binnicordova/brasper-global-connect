import { supabase as cloudClient } from "@/integrations/supabase/client";
import { createDemoClient, isDemoEnabled } from "./demo-supabase";
export const supabase = isDemoEnabled() ? createDemoClient() : cloudClient;
