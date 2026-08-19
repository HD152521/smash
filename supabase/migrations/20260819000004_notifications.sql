-- ════════════════════════════════════════════════════════════════════
-- 알림 — "내 경기가 잡혔다" 를 알려준다.
--
-- 체육관에서 가장 많이 나오는 질문이 "내 경기 언제야" 다. 지금은 앱을
-- 열어 확인하는 수밖에 없어서, 폰을 주머니에 넣은 사람은 놓친다.
--
-- 설계에서 중요한 것 두 가지:
--
--  1) '누구에게 알려야 하나' 는 경기가 만들어지는 그 트랜잭션 안에서
--     정한다. 나중에 훑어서 찾으면 그 사이에 편성이 바뀌었을 때
--     엉뚱한 사람에게 가거나 아무에게도 안 간다.
--
--  2) 보내는 일과 정하는 일을 나눈다 (아웃박스). 푸시 서버가 죽어 있어도
--     '보내야 할 것' 은 DB 에 남아 다음에 나간다. 트리거 안에서 바로
--     외부 호출을 하면 그 호출이 실패할 때 경기 편성까지 같이 롤백된다.
-- ════════════════════════════════════════════════════════════════════

-- ── 구독 정보 ───────────────────────────────────────────────────────
-- 브라우저마다 하나씩 생긴다. 한 사람이 폰·태블릿을 같이 쓰면 여러 개다.
create table push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- 같은 브라우저가 다시 구독하면 endpoint 가 같다. 중복을 막는 자연키다.
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  -- 브라우저를 지우거나 알림을 끄면 엔드포인트가 죽는다(410).
  -- 죽은 구독에 계속 쏘면 발송이 느려지므로 세어 두고 정리한다.
  failure_count   int not null default 0
);
create index push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_own_select on push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subscriptions_own_insert on push_subscriptions
  for insert with check (user_id = auth.uid());
create policy push_subscriptions_own_update on push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own_delete on push_subscriptions
  for delete using (user_id = auth.uid());

-- ── 보낼 것 (아웃박스) ──────────────────────────────────────────────
create table notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('match_scheduled')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  -- 같은 경기·같은 사람에게 두 번 보내지 않는다. 선수 두 명이 각각
  -- insert 되면서 트리거가 두 번 도는데, 알림은 한 번이어야 한다.
  unique (match_id, user_id, kind)
);
create index notification_outbox_pending_idx
  on notification_outbox(created_at) where sent_at is null;

alter table notification_outbox enable row level security;

-- 자기 앞으로 온 것만 본다. 쓰기 정책은 없다 — 트리거(SECURITY DEFINER)만 넣는다.
create policy notification_outbox_own_select on notification_outbox
  for select using (user_id = auth.uid());

-- ── 누구에게 알릴지 정하는 트리거 ───────────────────────────────────
--
-- 경기에 사람이 붙는 순간(선수 배정 / 심판 지정)에 아웃박스에 넣는다.
-- matches 에 INSERT 트리거를 걸면 그 시점엔 아직 선수가 없어서 못 쓴다.
create or replace function enqueue_match_notification(p_match_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_user_id uuid;
  v_status  match_status;
  v_source  match_source;
begin
  select status, source into v_status, v_source from matches where id = p_match_id;

  -- 이미 끝난 경기를 기록만 남기는 경우(수동 기록)는 알릴 이유가 없다.
  if v_status <> 'scheduled' or v_source <> 'live' then
    return;
  end if;

  select user_id into v_user_id from tournament_members where id = p_member_id;
  if v_user_id is null then
    return;
  end if;

  -- 편성한 본인은 이미 안다. 자기 폰이 울릴 이유가 없다.
  if v_user_id = auth.uid() then
    return;
  end if;

  insert into notification_outbox (match_id, user_id, kind)
  values (p_match_id, v_user_id, 'match_scheduled')
  on conflict (match_id, user_id, kind) do nothing;
end;
$fn$;

create or replace function on_match_player_added()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match_id uuid;
begin
  select match_id into v_match_id from match_teams where id = new.match_team_id;
  perform enqueue_match_notification(v_match_id, new.member_id);
  return new;
end;
$fn$;

create trigger match_players_notify
  after insert on match_team_players
  for each row execute function on_match_player_added();

create or replace function on_match_referee_added()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  perform enqueue_match_notification(new.match_id, new.member_id);
  return new;
end;
$fn$;

create trigger match_referees_notify
  after insert on match_referees
  for each row execute function on_match_referee_added();

-- ── 발송기가 쓰는 함수 ──────────────────────────────────────────────
--
-- service_role 로만 부른다. 아직 안 보낸 알림과 받을 사람의 구독을
-- 한 번에 준다. 화면에 보여줄 문구까지 여기서 만든다 — 발송기가
-- 조 이름·코트 이름을 다시 조회하지 않게.
create or replace function pending_notifications(p_limit int default 100)
returns table (
  outbox_id     uuid,
  user_id       uuid,
  title         text,
  body          text,
  url           text,
  subscriptions jsonb
)
language sql security definer set search_path = public, pg_temp as $fn$
  select
    o.id,
    o.user_id,
    '경기가 잡혔습니다'::text,
    concat_ws(' · ',
      concat(ga.name, ' vs ', gb.name),
      c.name,
      t.name
    ),
    concat('/t/', m.tournament_id, '/matches/', m.id),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
         from push_subscriptions s
        where s.user_id = o.user_id and s.failure_count < 5),
      '[]'::jsonb
    )
  from notification_outbox o
  join matches m on m.id = o.match_id
  join tournaments t on t.id = m.tournament_id
  left join courts c on c.id = m.court_id
  left join match_teams mta on mta.match_id = m.id and mta.side = 'A'
  left join groups ga on ga.id = mta.group_id
  left join match_teams mtb on mtb.match_id = m.id and mtb.side = 'B'
  left join groups gb on gb.id = mtb.group_id
  where o.sent_at is null
  order by o.created_at
  limit p_limit;
$fn$;

create or replace function mark_notifications_sent(p_ids uuid[])
returns void language sql security definer set search_path = public, pg_temp as $fn$
  update notification_outbox set sent_at = now() where id = any(p_ids);
$fn$;

-- 죽은 구독 정리. 410/404 를 받은 엔드포인트를 발송기가 알려준다.
create or replace function mark_subscription_failed(p_endpoint text, p_gone boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if p_gone then
    delete from push_subscriptions where endpoint = p_endpoint;
  else
    update push_subscriptions
       set failure_count = failure_count + 1
     where endpoint = p_endpoint;
  end if;
end;
$fn$;

create or replace function mark_subscription_ok(p_endpoint text)
returns void language sql security definer set search_path = public, pg_temp as $fn$
  update push_subscriptions
     set last_success_at = now(), failure_count = 0
   where endpoint = p_endpoint;
$fn$;

-- 발송기 전용. 일반 사용자에게는 절대 열지 않는다 —
-- pending_notifications 는 남의 구독 정보까지 돌려주기 때문이다.
revoke all on function pending_notifications(int) from public, anon, authenticated;
revoke all on function mark_notifications_sent(uuid[]) from public, anon, authenticated;
revoke all on function mark_subscription_failed(text, boolean) from public, anon, authenticated;
revoke all on function mark_subscription_ok(text) from public, anon, authenticated;
revoke all on function enqueue_match_notification(uuid, uuid) from public, anon, authenticated;

grant execute on function pending_notifications(int) to service_role;
grant execute on function mark_notifications_sent(uuid[]) to service_role;
grant execute on function mark_subscription_failed(text, boolean) to service_role;
grant execute on function mark_subscription_ok(text) to service_role;

-- 앱에서 내 알림을 실시간으로 받기 위해 (인앱 배너)
alter publication supabase_realtime add table notification_outbox;
