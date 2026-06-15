import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

if (!url || !key) {
  console.error("Supabase: не заданы VITE_SUPABASE_URL / VITE_SUPABASE_KEY");
}

// Клиент типизирован схемой БД (database.types.ts) — запросы supabase.from(...)
// и вызовы .rpc(...) проверяются по реальной схеме.
export const supabase = createClient<Database>(url, key);
