-- ════════════════════════════════════════════════════════════════════
-- rsvp 는 모임에만 뜻이 있다 — 대회 행은 항상 'going'
--
-- 20260827000001 이 rsvp 를 넣으면서 기존 100행을 'going' 으로 채웠다.
-- 이유가 명확했다:
--
--   "끝난 대회의 지난 명단이 영원히 '미정' 으로 남으면, 나중에
--    count(*) where rsvp='invited' 를 세는 순간 유령 미응답자가 잡힌다.
--    값이 의미를 배신하지 않게 하는 쪽이 싸다."
--
-- 그런데 컬럼 default 는 'invited' 다. 그래서 **그 마이그레이션 이후에
-- 만들어지는 대회 참가자는 'invited'** 가 된다. 같은 상황인데 행이 언제
-- 만들어졌느냐에 따라 값이 갈린다 — 위 논리와 정면으로 어긋난다.
--
-- 나중에 이 테이블을 읽는 사람은 옛 대회 행에 'going', 새 대회 행에
-- 'invited' 가 섞인 것을 보고 이유를 알 수 없다. 어느 한쪽으로 통일하는
-- 것보다 나쁜 상태다.
--
-- ── 왜 트리거인가 ───────────────────────────────────────────────────
--
-- tournament_members 에 쓰는 곳이 여럿이다 — create_tournament ·
-- join_tournament · add_roster_member · link_member_account · create_session.
-- 각자 채우게 두면 반드시 하나를 빠뜨리고, 다음에 여섯 번째가 생기면 또
-- 빠뜨린다. 이 저장소는 같은 이유로 match_teams_fill_rules 를 이미 쓴다
-- (목표점수·듀스 스냅샷을 편성 함수 셋이 각자 채우지 않게 한 것).
--
-- 모임 행은 건드리지 않는다. create_session 이 넣는 값('going' / 'invited')과
-- set_my_rsvp 가 바꾸는 값이 그대로 살아야 한다.
-- ════════════════════════════════════════════════════════════════════

create or replace function fill_member_rsvp()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_kind tournament_kind;
begin
  select kind into v_kind from tournaments where id = new.tournament_id;

  -- 대회에는 참가 신청이라는 개념이 없다 (set_my_rsvp 도 대회를 거절한다).
  -- 명단에 있다 = 나온다. 그러니 값은 'going' 하나뿐이어야 한다.
  if v_kind = 'tournament' then
    new.rsvp := 'going';
  end if;

  return new;
end;
$fn$;

drop trigger if exists tm_fill_rsvp on tournament_members;
create trigger tm_fill_rsvp
  before insert on tournament_members
  for each row execute function fill_member_rsvp();

-- 이 마이그레이션과 20260827000001 사이에 만들어진 대회 행이 있으면 맞춘다.
-- (그 창은 짧지만 0 이라고 단정할 이유가 없다)
update tournament_members tm
   set rsvp = 'going'
  from tournaments t
 where t.id = tm.tournament_id
   and t.kind = 'tournament'
   and tm.rsvp <> 'going';
