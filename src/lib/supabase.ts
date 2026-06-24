import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// Заданы ли ключи окружения. UI смотрит на этот флаг и показывает понятный
// экран настройки вместо белого экрана (см. App.jsx).
export const isSupabaseConfigured = Boolean(url && key);

if (!isSupabaseConfigured) {
  console.error("Supabase: не заданы VITE_SUPABASE_URL / VITE_SUPABASE_KEY");
}

// createClient бросает «supabaseUrl is required.» при пустом URL — это рушило
// весь модуль App ещё до рендера (белый экран). При отсутствии ключей подставляем
// безопасную заглушку, чтобы модуль не падал; реальных запросов в этом режиме нет —
// App рендерит экран настройки и не вызывает auth.
//
// Клиент типизирован схемой БД (database.types.ts) — запросы supabase.from(...)
// и вызовы .rpc(...) проверяются по реальной схеме.
export const supabase = createClient<Database>(
  url || "http://localhost:54321",
  key || "public-anon-key",
);
