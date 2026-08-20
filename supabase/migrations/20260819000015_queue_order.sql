-- ════════════════════════════════════════════════════════════════════
-- 대기 순서를 저장한다
--
-- 지금은 만든 시각으로만 줄이 선다. 관리자가 대진표에서 경기를 끌어
-- 옮겨도 다시 그리면 원래 자리로 돌아간다 — 순서를 담을 곳이 없다.
--
-- 기본값은 시퀀스다. 새로 만든 경기가 항상 줄 맨 뒤에 붙는다.
-- 0 같은 고정 기본값을 쓰면, 한 번 순서를 정한 코트에 새 경기를 넣었을 때
-- 그 경기가 맨 앞으로 튀어나온다.
-- ════════════════════════════════════════════════════════════════════

create sequence if not exists match_queue_seq;

alter table matches
  add column if not exists queue_order bigint not null default nextval('match_queue_seq');

-- 인덱스를 먼저 만든다.
-- 아래 UPDATE 가 알림용 제약 트리거(deferrable initially deferred)를 걸어 두면
-- 같은 트랜잭션 안에서 CREATE INDEX 가 거부된다:
--   cannot CREATE INDEX "matches" because it has pending trigger events
create index if not exists matches_queue_idx on matches(tournament_id, queue_order);

-- 기존 경기는 만든 순서 그대로 줄을 세운다.
-- 코트는 건드리지 않으므로 알림 트리거는 조용히 지나간다
-- (court_id 가 안 바뀌면 아무것도 하지 않는다).
with ordered as (
  select id, row_number() over (order by created_at) rn from matches
)
update matches m set queue_order = ordered.rn
  from ordered where ordered.id = m.id;

select setval('match_queue_seq', greatest((select coalesce(max(queue_order), 0) from matches), 1));

-- ── 뷰에 순서를 실어 보낸다 ─────────────────────────────────────────
-- 화면이 정렬하려면 이 값이 함께 와야 한다.
drop view if exists match_overview;
create view match_overview
with (security_invoker = true) as
select
  m.id,
  m.tournament_id,
  m.court_id,
  c.name as court_name,
  m.label,
  m.status,
  m.source,
  m.score_a,
  m.score_b,
  m.winner_side,
  m.queue_order,
  m.started_at,
  m.finished_at,
  m.edited_at,
  m.created_at,
  ta.group_id   as group_a_id,
  ga.name       as group_a_name,
  ga.is_joker   as group_a_joker,
  ta.target_score as target_a,
  tb.group_id   as group_b_id,
  gb.name       as group_b_name,
  gb.is_joker   as group_b_joker,
  tb.target_score as target_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = ta.id) as players_a,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = tb.id) as players_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_referees mr
     join tournament_members tm on tm.id = mr.member_id
    where mr.match_id = m.id) as referees
from matches m
left join courts c on c.id = m.court_id
left join match_teams ta on ta.match_id = m.id and ta.side = 'A'
left join groups ga on ga.id = ta.group_id
left join match_teams tb on tb.match_id = m.id and tb.side = 'B'
left join groups gb on gb.id = tb.group_id;

grant select on match_overview to authenticated;

-- ── 줄 세우기 ───────────────────────────────────────────────────────
--
-- 코트 하나의 대기열을 통째로 다시 쓴다. 옮기기와 순서 바꾸기가 같은 일이라
-- (다른 코트에서 끌어와 3번째에 놓기) 한 번에 처리한다.
--
-- p_court_id 가 null 이면 '코트 미배정' 줄이다.
create or replace function set_court_queue(
  p_tournament_id uuid,
  p_court_id      uuid,
  p_match_ids     uuid[]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_bad text;
begin
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 대기 순서를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  if p_court_id is not null
     and not exists (select 1 from courts
                      where id = p_court_id and tournament_id = p_tournament_id) then
    raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
  end if;

  -- 시작했거나 끝난 경기는 줄을 바꿀 대상이 아니다.
  -- 진행 중인 경기를 다른 코트로 끌어가면 한 코트 한 경기 규칙이 깨진다.
  select string_agg(distinct m.status::text, ', ') into v_bad
    from matches m
   where m.id = any(p_match_ids)
     and (m.tournament_id <> p_tournament_id or m.status <> 'scheduled');

  if v_bad is not null then
    raise exception '아직 시작하지 않은 경기만 옮길 수 있습니다' using errcode = '22023';
  end if;

  update matches m
     set court_id    = p_court_id,
         queue_order = pos.ord,
         updated_by  = auth.uid()
    from unnest(p_match_ids) with ordinality as pos(mid, ord)
   where m.id = pos.mid;
end;
$fn$;

revoke all on function set_court_queue(uuid, uuid, uuid[]) from public, anon;
grant execute on function set_court_queue(uuid, uuid, uuid[]) to authenticated;
