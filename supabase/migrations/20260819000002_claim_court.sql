-- ════════════════════════════════════════════════════════════════════
-- 공용 대기열 — 코트를 정하지 않고 편성하고, 비는 코트가 가져간다.
--
-- 실제 운영에서는 "이 경기는 아무 코트나 비면 하자" 가 흔하다.
-- 코트를 미리 못 박으면 그 코트만 밀리고 옆 코트는 놀게 된다.
--
-- court_id 가 null 인 경기는 모든 코트의 대기열에 함께 보이고,
-- 먼저 비는 코트에서 집어가면 그 순간 그 코트에 배정된다.
--
-- 심판도 집어갈 수 있어야 한다. 관리자만 되면 코트가 비었는데도
-- 관리자를 찾아다녀야 한다. 그래서 직접 UPDATE 가 아니라 RPC 로 연다.
-- ════════════════════════════════════════════════════════════════════

create or replace function claim_court(p_match_id uuid, p_court_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
    raise exception '이 경기의 심판이나 관리자만 코트를 잡을 수 있습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '아직 시작하지 않은 경기만 코트를 바꿀 수 있습니다' using errcode = '22023';
  end if;

  select name into v_court_name from courts
  where id = p_court_id and tournament_id = v_match.tournament_id;
  if not found then
    raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
  end if;

  -- 한 코트 한 경기. 대기열에서 집어가는 순간에도 지켜야 한다.
  if exists (select 1 from matches
             where court_id = p_court_id and status = 'live') then
    raise exception '%에서 진행 중인 경기를 먼저 끝내주세요', v_court_name using errcode = '22023';
  end if;

  update matches set court_id = p_court_id, updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

revoke all on function claim_court(uuid, uuid) from public, anon;
grant execute on function claim_court(uuid, uuid) to authenticated;
