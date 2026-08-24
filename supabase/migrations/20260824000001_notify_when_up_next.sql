-- ════════════════════════════════════════════════════════════════════
-- 알림 시점을 '코트 배정' 에서 '대기 순번' 으로 옮긴다.
--
-- 코트가 잡히는 순간 알려도, 그 코트에 앞선 경기가 다섯 개 걸려 있으면
-- 받는 사람은 한 시간 뒤에 뛴다. 알림이 울린 시점과 몸을 풀어야 할 시점이
-- 너무 멀어서 아무도 준비하지 않게 된다.
--
-- 실제로 알아야 할 순간은 '내 앞에 한 경기 남았다' 다. 그래서 코트 대기열의
-- 순번이 임계값(기본 2) 이하로 내려오면 알린다.
--
-- ── 설계에서 중요한 것 ──────────────────────────────────────────────
--
--  1) 내 순번은 '내 행' 이 바뀔 때가 아니라 '앞 사람이 빠질 때' 바뀐다.
--     앞 경기가 시작되면(scheduled → live) 대기열에서 빠지고 뒤가 한 칸씩
--     당겨진다. 그때 UPDATE 된 행은 앞 경기지 내 경기가 아니다.
--     그래서 트리거는 바뀐 행이 아니라 '그 행이 속한 코트 전체' 를 다시 센다.
--
--  2) 순번의 정의는 화면(SchedulePage 의 대기 번호)과 같아야 한다.
--     status='scheduled' and source='live' 를 queue_order, created_at 순으로
--     세운 자리다. 진행 중인 경기는 이미 코트에 있으므로 줄에서 뺀다.
--     ↔ src/lib/schedule.ts 의 queuePosition() 이 같은 정의를 쓴다.
--
--  3) 한 사람 한 경기에 한 번만 간다.
--     notification_outbox 의 unique (match_id, user_id, kind) 가 지킨다.
--     순서를 뒤로 뺐다가 다시 앞으로 당겨도 다시 울리지 않는다 — 관리자가
--     대진표를 정리하는 동안 전원의 폰이 계속 울리는 쪽이 더 나쁘다.
--
--  4) 제약 트리거(deferrable initially deferred)를 그대로 쓴다.
--     create_match 는 matches 를 먼저 넣고 선수·심판을 나중에 넣는다.
--     일반 트리거는 그 사이에 돌아서 '알릴 사람이 없다' 고 판단한다.
-- ════════════════════════════════════════════════════════════════════

drop trigger if exists matches_court_notify on matches;
drop function if exists on_match_court_assigned();

-- 예전 값은 이미 쌓인 행 때문에 남겨 둔다. 새로 쌓이는 건 'up_next' 뿐이다.
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('match_scheduled', 'court_assigned', 'up_next'));

-- ── 한 코트의 대기열을 다시 세고, 앞쪽 경기들에게 알린다 ────────────
create or replace function notify_up_next(p_court_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_threshold int;
  v_match_id  uuid;
  v_user_id   uuid;
begin
  if p_court_id is null then
    return;  -- 코트 미배정 줄에는 순번이 없다
  end if;

  select greatest(1, coalesce((t.config->>'readyQueuePosition')::int, 2))
    into v_threshold
    from courts c
    join tournaments t on t.id = c.tournament_id
   where c.id = p_court_id;

  if v_threshold is null then
    return;  -- 코트가 방금 지워졌다
  end if;

  for v_match_id in
    select m.id
      from matches m
     where m.court_id = p_court_id
       and m.status   = 'scheduled'
       and m.source   = 'live'   -- 지난 결과를 장부에만 남기는 수동 기록은 제외
     order by m.queue_order, m.created_at
     limit v_threshold
  loop
    for v_user_id in
      select tm.user_id
        from match_team_players mtp
        join match_teams mt on mt.id = mtp.match_team_id
        join tournament_members tm on tm.id = mtp.member_id
       where mt.match_id = v_match_id
      union
      select tm.user_id
        from match_referees mr
        join tournament_members tm on tm.id = mr.member_id
       where mr.match_id = v_match_id
    loop
      -- 방금 이 줄을 건드린 본인은 이미 안다. 자기 폰이 울릴 이유가 없다.
      if v_user_id is not null and v_user_id is distinct from auth.uid() then
        insert into notification_outbox (match_id, user_id, kind)
        values (v_match_id, v_user_id, 'up_next')
        on conflict (match_id, user_id, kind) do nothing;
      end if;
    end loop;
  end loop;
end;
$fn$;

revoke all on function notify_up_next(uuid) from public, anon, authenticated;

-- ── 줄이 흔들릴 때마다 다시 센다 ────────────────────────────────────
create or replace function on_match_queue_changed()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if tg_op = 'DELETE' then
    perform notify_up_next(old.court_id);
    return null;
  end if;

  -- 점수만 바뀌어도 트리거는 돈다. 줄이 그대로면 셀 이유가 없다.
  if tg_op = 'UPDATE'
     and new.court_id    is not distinct from old.court_id
     and new.status      is not distinct from old.status
     and new.queue_order is not distinct from old.queue_order then
    return null;
  end if;

  -- 다른 코트로 옮겨 갔으면 떠나온 줄도 한 칸씩 당겨진다
  if tg_op = 'UPDATE' and old.court_id is distinct from new.court_id then
    perform notify_up_next(old.court_id);
  end if;

  perform notify_up_next(new.court_id);
  return null;
end;
$fn$;

create constraint trigger matches_queue_notify
  after insert or update or delete on matches
  deferrable initially deferred
  for each row execute function on_match_queue_changed();

-- ── 알림 문구 ───────────────────────────────────────────────────────
-- 받는 사람이 알아야 할 것은 '어느 코트에 곧 들어가나' 다.
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
    case o.kind
      when 'up_next' then concat(coalesce(c.name, '코트'), ' 곧 차례입니다')
      else concat(coalesce(c.name, '코트'), ' 배정')
    end::text,
    case o.kind
      when 'up_next' then
        concat_ws(' · ', concat(ga.name, ' vs ', gb.name), '준비해 주세요')
      else
        concat_ws(' · ', concat(ga.name, ' vs ', gb.name), t.name)
    end::text,
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

revoke all on function pending_notifications(int) from public, anon, authenticated;
grant execute on function pending_notifications(int) to service_role;
