// Edge Function: request-ai-review
// ИИ-рецензент ЗРС в треде заявки. Читает заявку (Данные/Ситуация/Решение,
// сумма, статья, фонд), отправляет в Claude API и, если заявка неполная или
// есть уточняющие вопросы, пишет комментарий автору в request_comments
// (is_ai=true, author_id=null). Если заявка полная — молчит (без шума).
//
// Вызывается клиентом сразу после подачи/переподачи заявки (fire-and-forget).
// Ключ Claude — в Supabase Vault: vault.create_secret('<ключ>', 'anthropic_api_key').
// Пока ключа нет — функция возвращает {skipped:'no_key'} и ничего не пишет
// (фича «спит» до добавления ключа). Модель — секрет 'anthropic_model'
// (по умолчанию claude-haiku-4-5-20251001 — дёшево для проверки полноты).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM_PROMPT =
  "Ты — ассистент финансового комитета сети ресторанов и туйхон «Яккасарой». " +
  "Проверяешь заявку на расход средств (ЗРС). ЗРС состоит из трёх частей: " +
  "Данные (факты/цифры), Ситуация (в чём проблема/потребность), Решение (что предлагается). " +
  "Твоя задача — оценить ПОЛНОТУ и ЯСНОСТЬ заявки, а не одобрять или отклонять её. " +
  "Если чего-то не хватает для решения финкомитета (нет конкретных сумм/расчёта, неясно " +
  "обоснование, не указаны срок/поставщик/количество/единица, решение не вытекает из ситуации, " +
  "сумма не бьётся с данными, нет ожидаемого результата) — напиши КОРОТКИЙ вежливый комментарий " +
  "автору на русском языке с конкретными уточняющими вопросами или замечаниями. Формат: 1–5 " +
  "пунктов маркированным списком, по делу, без воды и без приветствий. " +
  "Если заявка полная и понятная — ответь РОВНО словом OK (без кавычек и без пояснений). " +
  "Не пиши ничего, кроме либо OK, либо списка вопросов.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { request_id } = await req.json().catch(() => ({}));
    if (!request_id) return json({ error: "request_id_required" }, 400);

    // --- кто вызвал (проверяем JWT пользователя) ---
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- заявка ---
    const { data: rq, error: rErr } = await admin
      .from("payment_requests")
      .select(`id, number, requester_id, planned_amount, purpose, csw_data, csw_situation, csw_solution,
        currency:currencies(code), expense_type:expense_types(code, name), fund:funds(code, name)`)
      .eq("id", request_id)
      .single();
    if (rErr || !rq) return json({ error: "request_not_found" }, 404);

    // --- доступ: автор заявки либо финадмин (owner/fin_director) ---
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
    const isFinAdmin = prof?.role === "owner" || prof?.role === "fin_director";
    if (rq.requester_id !== user.id && !isFinAdmin) return json({ error: "forbidden" }, 403);

    // --- ключ Claude (Vault). Нет ключа — фича «спит» ---
    const { data: apiKey } = await admin.rpc("mj_secret", { p_name: "anthropic_api_key" });
    if (!apiKey) return json({ skipped: "no_key" });
    const { data: modelSecret } = await admin.rpc("mj_secret", { p_name: "anthropic_model" });
    const model = (modelSecret as string | null) || "claude-haiku-4-5-20251001";

    // --- антидубль: не повторяем рецензию, если ИИ уже писал по этой заявке
    // за последние 30 секунд (двойной invoke клиента) ---
    const since = new Date(Date.now() - 30_000).toISOString();
    const { count: recent } = await admin
      .from("request_comments")
      .select("id", { count: "exact", head: true })
      .eq("request_id", request_id).eq("is_ai", true).gte("created_at", since);
    if (recent && recent > 0) return json({ skipped: "recent_review" });

    // --- промпт ---
    const cur = (rq.currency as { code?: string } | null)?.code || "TJS";
    const et = rq.expense_type as { code?: string; name?: string } | null;
    const fund = rq.fund as { code?: string; name?: string } | null;
    const userText = [
      `Заявка №${rq.number}`,
      `Статья расхода: ${et ? `${et.code || ""} ${et.name || ""}`.trim() : "—"}`,
      `Запрошенная сумма: ${rq.planned_amount ?? "—"} ${cur}`,
      `Фонд-источник: ${fund ? `${fund.code || ""} ${fund.name || ""}`.trim() : "не указан"}`,
      `Назначение: ${rq.purpose || "—"}`,
      "",
      `ДАННЫЕ: ${rq.csw_data || "(пусто)"}`,
      `СИТУАЦИЯ: ${rq.csw_situation || "(пусто)"}`,
      `РЕШЕНИЕ: ${rq.csw_solution || "(пусто)"}`,
    ].join("\n");

    // --- Claude API ---
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey as string,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: "anthropic_error", status: resp.status, detail: errText.slice(0, 500) }, 502);
    }
    const ai = await resp.json();
    const text = (ai?.content?.[0]?.text || "").trim();

    // Полная заявка → модель отвечает OK → не шумим.
    if (!text || text.toUpperCase() === "OK") return json({ posted: false, verdict: "ok" });

    const body = `🤖 Проверка ЗРС (ИИ):\n${text}`;
    const { error: insErr } = await admin
      .from("request_comments")
      .insert({ request_id, author_id: null, is_ai: true, body });
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);

    return json({ posted: true });
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});
