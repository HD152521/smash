-- ════════════════════════════════════════════════════════════════════
-- 알림 시점을 '편성' 에서 '코트 배정' 으로 옮긴다.
--
-- 편성만 해두고 코트를 안 정하면 언제 뛰는지 알 수 없다. 그 상태로 알림이
-- 가면 받는 사람은 할 게 없다. 코트가 잡혀야 비로소 '곧 그 코트로 가라' 는
-- 뜻이 된다.
--
-- 왜 matches 의 일반 트리거로 안 되는가:
--   create_match 는 matches 를 먼저 넣고 그 다음에 선수·심판을 넣는다.
--   INSERT 트리거는 그 시점에 돌아서 '알릴 사람이 아무도 없다' 고 판단한다.
--
--   그래서 제약 트리거(deferrable initially deferred)를 쓴다. 커밋 직전에
--   돌기 때문에 선수·심판이 다 들어간 뒤의 최종 상태를 본다.
--   코트를 지정해서 편성한 경우와 나중에 배정한 경우가 한 코드로 처리된다.
-- ════════════════════════════════════════════════════════════════════

drop trigger if exists match_players_notify on match_team_players;
drop trigger if exists match_referees_notify on match_referees;
drop function if exists on_match_player_added();
drop function if exists on_match_referee_added();
drop function if exists enqueue_match_notification(uuid, uuid);

-- 'court_assigned' 가 새 이름이다. 예전 값은 이미 쌓인 행 때문에 남겨 둔다.
alter table notification_outbox drop constraint notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('match_scheduled', 'court_assigned'));

create or replace function on_match_court_assigned()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_user_id uuid;
begin
  -- 코트가 없으면 알릴 것이 없다 (배정 해제도 여기서 걸러진다)
  if new.court_id is null then
    return null;
  end if;
  -- 코트가 그대로면 알릴 이유가 없다. 점수만 바뀌어도 트리거는 돈다.
  if tg_op = 'UPDATE' and old.court_id is not distinct from new.court_id then
    return null;
  end if;
  -- 이미 끝난 경기를 장부에만 남기는 수동 기록은 알릴 대상이 아니다
  if new.status <> 'scheduled' or new.source <> 'live' then
    return null;
  end if;

  for v_user_id in
    select tm.user_id
      from match_team_players mtp
      join match_teams mt on mt.id = mtp.match_team_id
      join tournament_members tm on tm.id = mtp.member_id
     where mt.match_id = new.id
    union
    select tm.user_id
      from match_referees mr
      join tournament_members tm on tm.id = mr.member_id
     where mr.match_id = new.id
  loop
    -- 배정한 본인은 이미 안다. 자기 폰이 울릴 이유가 없다.
    if v_user_id is not null and v_user_id is distinct from auth.uid() then
      insert into notification_outbox (match_id, user_id, kind)
      values (new.id, v_user_id, 'court_assigned')
      on conflict (match_id, user_id, kind) do nothing;
    end if;
  end loop;

  return null;
end;
$fn$;

-- 커밋 직전에 돈다 — 그래야 선수·심판이 다 들어간 뒤의 상태를 본다
create constraint trigger matches_court_notify
  after insert or update on matches
  deferrable initially deferred
  for each row execute function on_match_court_assigned();

-- ── 알림 문구도 '코트' 가 주인공이 되게 ─────────────────────────────
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
    -- 받는 사람이 알아야 할 것은 '어느 코트로 가라' 다
    concat(coalesce(c.name, '코트'), ' 배정')::text,
    concat_ws(' · ', concat(ga.name, ' vs ', gb.name), t.name),
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
