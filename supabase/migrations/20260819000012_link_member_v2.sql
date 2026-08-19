-- ════════════════════════════════════════════════════════════════════
-- 명단과 계정 잇기 (두 번째 시도)
--
-- 상황: 주최자가 명단으로 '이승희' 를 넣고 조까지 배정해 경기를 돌렸다.
--       그 사이 이승희 본인이 초대 코드로 들어와 계정 참가자가 하나 더 생겼다.
--       둘을 한 사람으로 합쳐야 한다.
--
-- 첫 번째 시도가 왜 틀렸나:
--   명단 행을 남기고 계정 행을 '통째로' 버렸다. 그 안에 있던 group_id 도
--   같이 사라져서, 명단 쪽에 조가 없으면 합친 뒤 아무 조에도 안 남았다.
--   행 단위로 고를 문제가 아니라 칸 단위로 정할 문제였다.
--
--   경기 기록  → 명단 쪽 (이미 뛰었으니 반드시 여기가 남아야 한다)
--   표시 이름  → 명단 쪽 (주최자가 명부 보고 적은 이름)
--   계정       → 계정 쪽 (합치는 목적 자체)
--   조         → 명단 쪽, 없으면 계정 쪽        ← 여기가 지난번 구멍
--   권한       → 둘 중 높은 쪽 (관리자를 강등시키면 안 된다)
--
-- 이름이 같다고 자동으로 붙이지 않는다. 프로필 이름을 '이승희' 로 바꾸고
-- 참가하면 남의 경기 기록을 통째로 가져갈 수 있다. 관리자가 지목해야 한다.
-- ════════════════════════════════════════════════════════════════════

create or replace function link_member_account(p_roster_member_id uuid, p_account_member_id uuid)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_roster  tournament_members;
  v_account tournament_members;
  v_plays   int;
  v_refs    int;
  v_role    member_role;
begin
  select * into v_roster from tournament_members where id = p_roster_member_id;
  if not found then
    raise exception '명단 참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  select * into v_account from tournament_members where id = p_account_member_id;
  if not found then
    raise exception '계정 참가자를 찾을 수 없습니다' using errcode = 'PT404';
  end if;

  if not is_tournament_admin(v_roster.tournament_id) then
    raise exception '관리자만 계정을 연결할 수 있습니다' using errcode = '42501';
  end if;
  if v_roster.id = v_account.id then
    raise exception '같은 참가자끼리는 연결할 수 없습니다' using errcode = '22023';
  end if;
  if v_roster.tournament_id <> v_account.tournament_id then
    raise exception '같은 대회의 참가자끼리만 연결할 수 있습니다' using errcode = '22023';
  end if;
  if v_roster.user_id is not null then
    raise exception '%님은 이미 계정이 연결돼 있습니다', v_roster.display_name
      using errcode = '22023';
  end if;
  if v_account.user_id is null then
    raise exception '연결할 계정이 없는 참가자입니다' using errcode = '22023';
  end if;
  if v_account.role = 'owner' then
    raise exception '주최자 계정은 명단에 합칠 수 없습니다' using errcode = '22023';
  end if;

  -- 양쪽 다 경기를 뛰었으면 어느 기록을 남길지 사람이 판단해야 한다.
  -- 계정 쪽만 뛰었다면 합칠 게 아니라 기록 없는 명단 쪽을 지우면 된다.
  select count(*) into v_plays from match_team_players where member_id = p_account_member_id;
  select count(*) into v_refs from match_referees where member_id = p_account_member_id;
  if v_plays > 0 or v_refs > 0 then
    raise exception
      '%님의 계정으로 이미 경기를 뛰었습니다. 합치는 대신 기록이 없는 명단 쪽을 빼주세요',
      v_account.display_name using errcode = '22023';
  end if;

  -- 관리자를 강등시키지 않는다
  v_role := case
    when v_roster.role = 'owner' or v_account.role = 'owner' then 'owner'
    when v_roster.role = 'admin' or v_account.role = 'admin' then 'admin'
    else 'member'
  end;

  -- 순서가 중요하다. 계정 행을 먼저 지워야 unique(tournament_id, user_id) 에 안 걸린다.
  delete from tournament_members where id = p_account_member_id;

  update tournament_members
     set user_id  = v_account.user_id,
         -- ★ 명단 쪽에 조가 없으면 계정 쪽이 고른 조를 가져온다.
         --   이걸 빠뜨려서 합친 사람이 아무 조에도 안 남았다.
         group_id = coalesce(v_roster.group_id, v_account.group_id),
         role     = v_role,
         updated_at = now()
   where id = p_roster_member_id
  returning * into v_roster;

  perform log_audit(v_roster.tournament_id, 'member.link', 'tournament_member',
                    p_roster_member_id, to_jsonb(v_account), to_jsonb(v_roster));
  return v_roster;
end;
$fn$;

revoke all on function link_member_account(uuid, uuid) from public, anon;
grant execute on function link_member_account(uuid, uuid) to authenticated;
