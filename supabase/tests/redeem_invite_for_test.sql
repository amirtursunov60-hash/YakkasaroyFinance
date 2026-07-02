-- pgTAP: инвариант серверного приёма приглашения redeem_invite_for.
-- Запуск: supabase test db (на ветке/staging).
begin;
select plan(6);

-- Право выполнения — только у service_role
select ok(
  has_function_privilege('service_role', 'public.redeem_invite_for(uuid, text, text)', 'execute'),
  'service_role может выполнять redeem_invite_for'
);
select ok(
  not has_function_privilege('authenticated', 'public.redeem_invite_for(uuid, text, text)', 'execute'),
  'authenticated НЕ может выполнять redeem_invite_for'
);
select ok(
  not has_function_privilege('anon', 'public.redeem_invite_for(uuid, text, text)', 'execute'),
  'anon НЕ может выполнять redeem_invite_for'
);

-- Готовим пользователя в auth.users и приглашение
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000aa', 'invitee_test@example.com')
on conflict (id) do nothing;

insert into invites (id, token, role, created_by, expires_at)
values ('00000000-0000-0000-0000-0000000000b1', 'tok_test_valid', 'employee',
        '00000000-0000-0000-0000-0000000000aa', now() + interval '7 days');

-- Успешный приём: создаёт профиль с ролью из приглашения и помечает использованным
select lives_ok(
  $$ select public.redeem_invite_for('00000000-0000-0000-0000-0000000000aa', 'tok_test_valid', 'Тест Тестов') $$,
  'redeem_invite_for применяет действующее приглашение'
);
select is(
  (select role::text from profiles where id = '00000000-0000-0000-0000-0000000000aa'),
  'employee',
  'роль профиля взята из приглашения'
);

-- Повторный приём того же токена — отказ (уже использовано)
select throws_ok(
  $$ select public.redeem_invite_for('00000000-0000-0000-0000-0000000000aa', 'tok_test_valid', null) $$,
  'Приглашение уже использовано'
);

select * from finish();
rollback;
