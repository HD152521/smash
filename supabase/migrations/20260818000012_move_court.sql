-- ════════════════════════════════════════════════════════════════════
-- 코트 순서 바꾸기
--
-- 체육관에서 코트 번호는 물리적 배치를 따른다. 나중에 코트를 추가하면
-- 화면 순서가 실제 배치와 어긋나는데, 지우고 다시 만들면 그 코트에서
-- 치른 경기 기록이 딸려 나간다 (courts 삭제 시 matches.court_id 가 null 이 됨).
--
-- 그래서 순서만 맞바꾼다.
--
-- 왜 RPC 인가:
--   courts 에 unique (tournament_id, sort_order) 가 걸려 있어서
--   두 행의 값을 그냥 맞바꾸면 중간 상태에서 제약을 위반한다.
--   임시 값을 거쳐야 하고, 그 세 단계가 원자적이어야 한다.
-- ════════════════════════════════════════════════════════════════════

create or replace function move_court(p_court_id uuid, p_direction int)
returns setof courts
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_court    courts;
  v_neighbor courts;
  v_tmp      int;
begin
  if p_direction not in (-1, 1) then
    raise exception '방향은 위(-1) 또는 아래(1) 만 가능합니다' using errcode = '22023';
  end if;

  select * into v_court from courts where id = p_court_id;
  if not found then
    raise exception '코트를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_tournament_admin(v_court.tournament_id) then
    raise exception '관리자만 코트 순서를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  -- 바로 옆 코트를 찾는다. sort_order 가 연속이 아닐 수 있으므로
  -- '값이 하나 더/덜 큰 것' 이 아니라 '가장 가까운 것' 을 고른다.
  if p_direction = -1 then
    select * into v_neighbor from courts
    where tournament_id = v_court.tournament_id and sort_order < v_court.sort_order
    order by sort_order desc limit 1;
  else
    select * into v_neighbor from courts
    where tournament_id = v_court.tournament_id and sort_order > v_court.sort_order
    order by sort_order asc limit 1;
  end if;

  -- 맨 위/아래면 아무 일도 하지 않는다 (오류가 아니다 — 버튼이 비활성일 뿐)
  if not found then
    return query select * from courts
      where tournament_id = v_court.tournament_id order by sort_order;
    return;
  end if;

  -- unique 제약 때문에 임시 값을 거친다.
  -- sort_order 는 항상 양수이므로 음수는 절대 충돌하지 않는다.
  v_tmp := -1 - v_court.sort_order;
  update courts set sort_order = v_tmp where id = v_court.id;
  update courts set sort_order = v_court.sort_order where id = v_neighbor.id;
  update courts set sort_order = v_neighbor.sort_order where id = v_court.id;

  return query select * from courts
    where tournament_id = v_court.tournament_id order by sort_order;
end;
$fn$;

revoke all on function move_court(uuid, int) from public, anon;
grant execute on function move_court(uuid, int) to authenticated;
