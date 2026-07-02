// Журнал ошибок фронта (client_errors, ADR-0009): чтение и архив — финадминам.
// Запись делает src/lib/monitoring.ts (best-effort), не этот модуль.
import { supabase } from "../supabase";

export interface ClientError {
  id: number;
  created_at: string;
  profile_id: string | null;
  message: string;
  stack: string | null;
  component_stack: string | null;
  url: string | null;
  user_agent: string | null;
  is_archived: boolean;
}

export async function fetchClientErrors(limit = 200): Promise<ClientError[]> {
  const { data, error } = await supabase
    .from("client_errors")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ClientError[];
}

// Архив вместо удаления (соглашение схемы)
export async function archiveClientError(id: number): Promise<void> {
  const { error } = await supabase.from("client_errors").update({ is_archived: true }).eq("id", id);
  if (error) throw error;
}
