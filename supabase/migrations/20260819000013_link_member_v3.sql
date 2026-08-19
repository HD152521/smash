-- ════════════════════════════════════════════════════════════════════
-- 명단·계정 잇기 (세 번째) — 양쪽 기록을 합친다
--
-- 두 번째 버전은 '계정 쪽도 경기를 뛰었으면' 아예 막았다. 어느 기록을
-- 남길지 모르겠다는 이유였는데, 실제 대회에서는 그게 유일한 사례였다:
--
--   김현규 (계정)   1조, 1경기   ← 본인이 코드로 들어와 뛴 경기
--   김현규 (미가입) 1조, 1경기   ← 주최자가 명단으로 넣고 편성한 경기
--
-- 같은 사람이다. 그때그때 손에 잡히는 행으로 편성했을 뿐이다.
-- 합치면 2경기를 뛴 한 사람이 되는 게 맞다. 기록을 버릴 이유가 없다.
--
-- 그래서 '남길 쪽을 고르는' 대신 '옮겨서 합친다'.
--
-- 다만 합칠 수 없는 경우가 둘 있다. 둘 다 '한 사람이 될 수 없는' 상태다:
--   1) 같은 경기에서 서로 맞붙었다 (자기 자신과 경기한 셈이 된다)
--   2) 한쪽은 뛰고 한쪽은 그 경기 심판이었다 (뛰는 사람은 심판을 못 본다)
-- 이건 사람이 기록을 고쳐야 하므로 어느 경기인지 알려주고 멈춘다.
-- ════════════════════════════════════════════════════════════════════

create or replace function link_member_account(p_roster_member_id uuid, p_account_member_id uuid)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_roster  tournament_members;
  v_account tournament_members;
  v_role    member_role;
  v_clash   text;
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

  -- ① 같은 경기에서 서로 맞붙었나 (합치면 자기 자신과 경기한 셈이 된다)
  select string_agg(distinct coalesce(c.name, '코트 미정'), ', ') into v_clash
  from match_team_players pa
  join match_teams ta on ta.id = pa.match_team_id
  join match_team_players pb on pb.member_id = p_roster_member_id
  join match_teams tb on tb.id = pb.match_team_id and tb.match_id = ta.match_id
  join matches m on m.id = ta.match_id
  left join courts c on c.id = m.court_id
  where pa.member_id = p_account_member_id and ta.side <> tb.side;

  if v_clash is not null then
    raise exception
      '두 참가자가 같은 경기에서 맞붙은 기록이 있습니다 (%). 합치면 자기 자신과 경기한 것이 되므로, 그 경기를 먼저 고쳐 주세요',
      v_clash using errcode = '22023';
  end if;

  -- ② 한쪽은 뛰고 한쪽은 그 경기 심판인가 (뛰는 사람은 심판을 볼 수 없다)
  select string_agg(distinct coalesce(c.name, '코트 미정'), ', ') into v_clash
  from matches m
  left join courts c on c.id = m.court_id
  where exists (
          select 1 from match_referees r
           where r.match_id = m.id and r.member_id in (p_roster_member_id, p_account_member_id))
    and exists (
          select 1 from match_team_players p
            join match_teams tt on tt.id = p.match_team_id
           where tt.match_id = m.id and p.member_id in (p_roster_member_id, p_account_member_id));

  if v_clash is not null then
    raise exception
      '한쪽이 뛴 경기의 심판을 다른 쪽이 맡고 있습니다 (%). 뛰는 사람은 그 경기 심판을 볼 수 없으므로 먼저 고쳐 주세요',
      v_clash using errcode = '22023';
  end if;

  -- 관리자를 강등시키지 않는다
  v_role := case
    when v_roster.role = 'owner' or v_account.role = 'owner' then 'owner'
    when v_roster.role = 'admin' or v_account.role = 'admin' then 'admin'
    else 'member'
  end;

  -- ── 기록을 명단 쪽으로 옮긴다 ────────────────────────────────────
  -- 이미 같은 팀에 명단 쪽이 들어 있으면 옮길 수 없다(중복). 그건 버린다.
  update match_team_players mtp
     set member_id = p_roster_member_id
   where mtp.member_id = p_account_member_id
     and not exists (
       select 1 from match_team_players x
        where x.match_team_id = mtp.match_team_id and x.member_id = p_roster_member_id);
  delete from match_team_players where member_id = p_account_member_id;

  update match_referees mr
     set member_id = p_roster_member_id
   where mr.member_id = p_account_member_id
     and not exists (
       select 1 from match_referees x
        where x.match_id = mr.match_id and x.member_id = p_roster_member_id);
  delete from match_referees where member_id = p_account_member_id;

  -- 순서가 중요하다. 계정 행을 먼저 지워야 unique(tournament_id, user_id) 에 안 걸린다.
  delete from tournament_members where id = p_account_member_id;

  update tournament_members
     set user_id  = v_account.user_id,
         -- 명단 쪽에 조가 없으면 계정 쪽이 고른 조를 가져온다
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
