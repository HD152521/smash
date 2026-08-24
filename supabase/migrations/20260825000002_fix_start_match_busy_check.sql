-- ════════════════════════════════════════════════════════════════════
-- start_match 에서 사라진 검사를 되돌린다
--
-- 20260825000001 에서 권한 검사를 can_run_match 로 바꾸려고 start_match 를
-- 다시 만들었는데, **낡은 버전에서 복사했다.** 20260818000011 을 최신으로
-- 알았지만 실제 최신은 20260819000003_queue_ahead.sql 이었다 — create_match
-- 에 있던 '지금 뛰는 선수' 검사가 그때 start_match 로 옮겨 온 것이다.
--
-- 그래서 이 검사가 통째로 빠졌다:
--
--   한 사람이 동시에 두 코트에서 뛸 수는 없다
--
-- db:smoke:match 의 '선수가 다른 코트에서 뛰는 중이면 시작할 수 없다' 가
-- 잡아냈다. 실기기에서는 이렇게 나타난다 — 방금 1번 코트에 들어간 사람을
-- 2번 코트 경기에 넣어도 시작이 되고, 그 사람은 두 코트에서 동시에 호출된다.
--
-- 모임에서는 이 검사가 대회보다 더 자주 걸린다. 아무나 코트를 잡을 수 있어서
-- 방금 들어간 사람을 다음 경기에 또 넣는 일이 잦다.
--
-- ── 왜 20260825000001 을 고치지 않았나 ──────────────────────────────
-- 그 파일은 이미 적용됐다. 적용된 마이그레이션을 고치면 파일과 실제 DB 가
-- 어긋난다 — 새 환경은 고친 것을 받고 지금 DB 는 안 받는다.
-- 이 저장소가 이미 쓰는 방식대로(20260819000001_fix_guard_permission.sql)
-- 수정을 다음 마이그레이션으로 둔다.
-- ════════════════════════════════════════════════════════════════════

create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
  v_busy text;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not can_run_match(p_match_id) then
    raise exception '이 경기를 시작할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기입니다' using errcode = '22023';
  end if;

  if v_match.court_id is not null then
    select c.name into v_court_name from courts c where c.id = v_match.court_id;
    if exists (select 1 from matches m
               where m.court_id = v_match.court_id and m.status = 'live' and m.id <> p_match_id) then
      raise exception '%에서 진행 중인 경기를 먼저 끝내주세요', v_court_name using errcode = '22023';
    end if;
  end if;

  -- 한 사람이 동시에 두 코트에서 뛸 수는 없다
  select string_agg(distinct tm.display_name, ', ') into v_busy
  from match_team_players mtp
  join match_teams mt on mt.id = mtp.match_team_id
  join matches other on other.id = mt.match_id
  join tournament_members tm on tm.id = mtp.member_id
  where other.status = 'live'
    and other.id <> p_match_id
    and mtp.member_id in (
      select mtp2.member_id
      from match_team_players mtp2
      join match_teams mt2 on mt2.id = mtp2.match_team_id
      where mt2.match_id = p_match_id
    );

  if v_busy is not null then
    raise exception '%님이 다른 코트에서 경기 중입니다. 그 경기가 끝난 뒤 시작해 주세요', v_busy
      using errcode = '22023';
  end if;

  update matches
  set status = 'live', started_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;
