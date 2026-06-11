import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  console.error("Supabase: не заданы VITE_SUPABASE_URL / VITE_SUPABASE_KEY");
}

export const supabase = createClient(url, key);
