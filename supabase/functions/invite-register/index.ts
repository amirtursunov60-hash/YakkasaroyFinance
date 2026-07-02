// Регистрация сотрудника по одноразовой ссылке-приглашению БЕЗ письма-подтверждения.
//
// Почему функция: включённое «Confirm email» + дефолтный Site URL (localhost) +
// выедание одноразового токена /verify предзагрузкой почтовых сканеров (Gmail)
// давали сотруднику ошибку «Email link is invalid or has expired». Доступ к
// регистрации и так защищён самим приглашением (секретный одноразовый токен),
// поэтому создаём пользователя сразу подтверждённым и применяем приглашение.
//
// Безопасность: функция публичная (verify_jwt=false — пользователь ещё не вошёл),
// но ничего не делает без действующего токена приглашения; роль берётся из записи
// invites, а не из тела запроса. Приём приглашения — через RPC redeem_invite_for,
// доступную только service_role.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Метод не поддерживается" }, 405);

  try {
    const { token, email, password, full_name } = await req.json().catch(() => ({}));
    if (!token || !email || !password) {
      return json({ ok: false, error: "Не хватает данных для регистрации" });
    }
    if (String(password).length < 6) {
      return json({ ok: false, error: "Пароль слишком короткий (минимум 6 символов)" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Проверяем приглашение (быстрый отказ до создания пользователя)
    const { data: inv, error: invErr } = await admin
      .from("invites")
      .select("id, used_by, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (invErr) return json({ ok: false, error: invErr.message }, 500);
    if (!inv) return json({ ok: false, error: "Приглашение не найдено" });
    if (inv.used_by) return json({ ok: false, error: "Приглашение уже использовано" });
    if (new Date(inv.expires_at as string) < new Date()) {
      return json({ ok: false, error: "Срок действия приглашения истёк" });
    }

    // 2) Создаём пользователя уже подтверждённым (без письма)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: full_name ?? null },
    });
    if (cErr) {
      const m = cErr.message || "";
      if (/already|registered|exists/i.test(m)) {
        return json({ ok: false, error: "Этот email уже зарегистрирован — войдите со своим паролем" });
      }
      return json({ ok: false, error: "Не удалось создать аккаунт: " + m });
    }
    const userId = created.user?.id;
    if (!userId) return json({ ok: false, error: "Пользователь не создан" }, 500);

    // 3) Применяем приглашение (роль/точка/пост + пометка использованным)
    const { error: rErr } = await admin.rpc("redeem_invite_for", {
      p_user: userId,
      p_token: token,
      p_full_name: full_name ?? null,
    });
    if (rErr) {
      // Откат: удаляем созданного пользователя, чтобы не остался «висячий» аккаунт
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ ok: false, error: "Не удалось применить приглашение: " + rErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || "Внутренняя ошибка" }, 500);
  }
});
