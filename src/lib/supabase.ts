import { createClient } from "@supabase/supabase-js";
import { createDemoClient, isDemoEnabled } from "./demo-supabase";
const url = import.meta.env["VITE_SUPABASE_URL"];
const key =
  import.meta.env["VITE_SUPABASE_ANON_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
export const supabase = isDemoEnabled()
  ? createDemoClient()
  : url && key
    ? createClient(url, key)
    : null;
