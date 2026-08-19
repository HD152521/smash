-- ════════════════════════════════════════════════════════════════════
-- 표시 이름 바꾸기
--
-- 지금은 tournament_members 를 관리자만 수정할 수 있어서(tm_update_admin)
-- 참가자가 자기 이름조차 못 고친다. 오타로 들어온 이름이 대진표·순위표에
-- 그대로 박힌 채 대회가 끝난다.
--
-- 왜 RLS 정책을 넓히지 않고 RPC 로 여는가:
--   '본인 행은 수정 가능' 정책을 열면 display_name 만 열리는 게 아니다.
--   같은 행의 group_id 도 함께 열려서, 참가자가 set_my_group 을 우회해
--   대회가 시작된 뒤에도 조를 바꿀 수 있게 된다.
--   바꿀 수 있는 칸을 하나로 못 박으려면 함수여야 한다.
-- ════════════════════════════════════════════════════════════════════

create or replace function set_display_name(p_member_id uuid, p_name text)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_before jsonb;
  v_clean  text;
  v_is_self boolean;
begin
  select * into v_member from tournament_members where id = p_member_id;
  if not found then
    raise exception '참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  v_is_self := v_member.user_id = auth.uid();

  -- 본인이거나, 그 대회의 관리자여야 한다
  if not (v_is_self or is_tournament_admin(v_member.tournament_id)) then
    raise exception '본인 또는 관리자만 이름을 바꿀 수 있습니다' using errcode = '42501';
  end if;

  v_clean := btrim(coalesce(p_name, ''));
  if length(v_clean) < 1 or length(v_clean) > 20 then
    raise exception '이름은 1~20자로 입력해 주세요' using errcode = '22023';
  end if;

  -- 같은 대회에 같은 이름이 둘이면 대진표에서 누가 누군지 알 수 없다.
  -- 심판 지정도 이름으로 확인하므로 엉뚱한 사람이 채점하게 된다.
  if exists (
    select 1 from tournament_members
    where tournament_id = v_member.tournament_id
      and id <> p_member_id
      and lower(btrim(display_name)) = lower(v_clean)
  ) then
    raise exception '이 대회에 같은 이름이 이미 있습니다' using errcode = '23505';
  end if;

  if v_clean = v_member.display_name then
    return v_member;
  end if;

  v_before := to_jsonb(v_member);
  update tournament_members
     set display_name = v_clean, updated_at = now()
   where id = p_member_id
  returning * into v_member;

  -- 본인이 바꾼 것이면 프로필도 맞춰 준다. 안 그러면 첫 화면 인사말과
  -- 대진표의 이름이 서로 달라 보인다.
  -- 관리자가 남의 이름을 고친 경우에는 그 사람의 프로필까지 건드리지 않는다.
  if v_is_self then
    update profiles set name = v_clean, updated_at = now() where id = auth.uid();
  end if;

  -- 남의 이름을 바꾼 것은 흔적이 남아야 한다
  if not v_is_self then
    perform log_audit(v_member.tournament_id, 'member.rename', 'tournament_member',
                      p_member_id, v_before, to_jsonb(v_member));
  end if;

  return v_member;
end;
$fn$;

revoke all on function set_display_name(uuid, text) from public, anon;
grant execute on function set_display_name(uuid, text) to authenticated;
