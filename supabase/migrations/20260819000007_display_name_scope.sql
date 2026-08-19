-- ════════════════════════════════════════════════════════════════════
-- 대회 안에서 바꾼 이름은 그 대회에만 남는다.
--
-- 직전 버전은 본인이 이름을 바꾸면 profiles.name 까지 함께 고쳤다.
-- 그러면 A 대회에서 별명으로 바꾼 게 B 대회 기록에까지 번진다.
-- 대회마다 부르는 이름이 다른 게 자연스럽고(본명 / 별명 / 클럽 닉네임),
-- 무엇보다 지난 대회의 기록에 적힌 이름이 나중에 바뀌면 안 된다.
--
-- 그래서 tournament_members.display_name 만 건드린다.
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

  -- profiles 는 건드리지 않는다. 이 대회에서만 바뀌어야 한다.

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
