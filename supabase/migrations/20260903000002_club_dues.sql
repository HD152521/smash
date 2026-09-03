-- ════════════════════════════════════════════════════════════════════
-- 월 회비 장부 — 돈을 옮기지 않는다. 총무가 통장을 보고 체크할 뿐이다.
--
-- 총무의 진짜 고통은 이체가 아니라 "누가 안 냈지" 를 카톡 스크롤과
-- 엑셀에서 찾는 것이다. 그래서 이 마이그레이션은 결제도 이체도 만들지
-- 않는다. 만드는 것은 **체크할 수 있는 명부** 하나다.
--
-- ── 🔴 이 기능의 유일한 진짜 위험: 미납자 명단 유출 ─────────────────
--
-- 동아리에서 "누가 회비 안 냈다" 가 공개되면 실제로 사람이 나간다.
-- 그래서 이 원장의 불변식은 하나다:
--
--     club_dues 는 운영진에게만 보인다. 회원에게는 한 행도 안 보인다.
--
-- RLS select 정책이 `is_club_admin(club_id)` **하나뿐**인 이유가 그것이다.
-- 회원용 창구는 club_dues_summary() 하나이고, 그 함수는 숫자(합계)와
-- **호출자 본인 행**만 돌려준다. 남의 이름은 어떤 경로로도 안 나간다.
--
-- ⚠ 여기서 흔히 밟는 지뢰: "회원도 자기 동아리 납부 행은 읽게" 열어 주면
--   미납자에게는 행이 없거나 paid_on 이 null 이므로 **없는 것 자체가
--   명단이 된다.** 합계를 보여주는 요구와 미납을 감추는 요구가 정면으로
--   충돌한다. 그래서 테이블을 여는 대신 SECURITY DEFINER 로 **숫자만**
--   내보내는 길을 택했다 — guest_board(20260829000001) 가 "끝난 경기는
--   목록이 아니라 숫자 하나다" 로 쓴 것과 같은 규율이다.
--
-- ── 설계 판단 ───────────────────────────────────────────────────────
--
-- 1) 미납을 "행이 없음" 으로 두지 않고 **행을 미리 만든다.**
--    "48만원 중 39만원" 을 말하려면 아직 안 낸 사람이 얼마를 내야 하는지
--    알아야 한다. 행이 없으면 그 금액이 어디에도 없다. 그래서 달을 열 때
--    (open_dues_month) 회원 전원의 행을 만들고, 납부 여부는 paid_on 이
--    채워졌는지로 본다. 미납은 행의 부재가 아니라 **paid_on is null** 이다.
--
-- 2) 금액은 앱이 계산하지 않는다. 동아리마다 규칙이 다르다(신입 할인,
--    반년 선납, 휴회). 총무가 달을 열 때 기본 금액을 적고, 다른 사람은
--    set_dues_amount 로 하나씩 고친다. 자동 계산을 넣으면 규칙이 다른
--    동아리에서 총무가 고칠 방법이 없어진다.
--
-- 3) 회비는 club_members 기준이다. user_id 기준이 아니다.
--    club_members.user_id 는 nullable 이고(20260826000001), 지금 명단에도
--    계정 없는 회원이 있다. 회비는 계정이 아니라 **사람** 에게 붙는다.
--    tournament_members 가 명단을 user_id 없이 들고 있는 것과 같은 이유다
--    (20260819000008).
--
-- 4) 되돌릴 수 있어야 하고 흔적이 남아야 한다. 돈 기록은 반드시 틀린다 —
--    잘못 체크하고, 이체가 늦게 들어온다. 되돌릴 수 없으면 총무가 앱을
--    안 믿고 엑셀로 돌아간다. set_dues_paid 는 양방향(true/false)이고,
--    모든 변경은 log_audit_club 으로 audit_logs 에 남는다.
--    "누가 언제 이 사람을 납부로 바꿨나" 는 컬럼이 아니라 감사로그가
--    답한다 — 그래서 paid_by 컬럼을 따로 만들지 않았다.
--
-- 5) member_id 는 on delete set null + member_name 스냅샷이다.
--    cascade 로 두면 회원 한 명을 명단에서 빼는 순간 지난 9월의 "39만원
--    걷힘" 이 조용히 36만원으로 바뀐다. 오류도 안 뜨고 근거만 어긋난다
--    (20260819000008 이 경기 기록에 건 것과 같은 이유). 원장은 사람이
--    나가도 그대로 남아야 한다.
--
-- ── 게스트비를 나중에 얹을 자리 ─────────────────────────────────────
--
-- 게스트비는 **결이 다르다**: 모임(tournaments.kind='session') 단위이고,
-- 게스트는 계정도 club_members 행도 없다(20260828000001 의 is_guest 주석).
-- 그래서 이 테이블에 억지로 섞지 않았다. 나중에 붙일 자리는 둘이다.
--   · 표는 session_guest_fees 로 따로 선다 (grain: 모임 × 게스트).
--     club_dues 의 grain 은 회원 × 달이라 섞으면 두 컬럼이 서로
--     nullable 이 되고 "둘 중 뭐냐" 를 매번 물어야 한다.
--   · club_dues_summary 가 **jsonb 를 돌려주는 이유**가 이것이다.
--     returns table 이면 컬럼을 늘릴 때 시그니처가 바뀌어 옛 함수를
--     drop 해야 한다(PostgREST 는 함수를 **이름 붙은 인자 집합**으로
--     찾으므로 안 지우면 function is not unique 가 난다). jsonb 는
--     'guest_total' 키를 더해도 시그니처가 그대로다.
-- 이번 마이그레이션은 게스트비를 **만들지 않는다.** 자리만 비워 둔다.
--
-- ── 이 마이그레이션이 안 건드린 것 ──────────────────────────────────
--   · 결제·이체 연동 — 없다. 돈은 계속 계좌이체로 오간다.
--   · 자동 미납 독촉·알림 — 만들지 않는다. 앱이 사람을 재촉하면
--     미움받는다. notification_outbox 에 아무것도 넣지 않는다.
--     총무가 보고 직접 말하는 것이 맞다.
--   · 지출·수지 정산 — 범위 밖.
--   · clubs / club_members 스키마 — 한 컬럼도 안 바꾼다.
-- ════════════════════════════════════════════════════════════════════

-- ── club_dues ───────────────────────────────────────────────────────
create table club_dues (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references clubs(id) on delete cascade,

  -- 판단 5: 사람이 나가도 원장은 남는다. 그래서 set null + 이름 스냅샷.
  -- unique(member_id, period_month) 는 그대로 둔다 — 포스트그레스에서
  -- null 은 서로 같지 않으므로 나간 회원의 행이 여럿이어도 안 부딪힌다
  -- (20260819000008 이 tournament_members 에 기댄 것과 같은 성질).
  member_id     uuid references club_members(id) on delete set null,
  member_name   text not null check (length(btrim(member_name)) between 1 and 20),

  -- 달의 1일로 정규화해서 넣는다. extract 를 쓰는 이유는 immutable 이기
  -- 때문이다 — date_trunc 는 입력 타입에 따라 stable 로 잡혀 check 제약에
  -- 못 쓰는 경우가 있다.
  period_month  date not null check (
                  extract(day from period_month) = 1
                  and period_month between date '2020-01-01' and date '2100-01-01'),

  -- 판단 2: 총무가 적는 금액. 원 단위 정수.
  amount        integer not null check (amount between 0 and 10000000),

  -- 판단 1: 미납 = paid_on is null. 통장에 돈이 들어온 날을 총무가 적는다
  -- (체크한 날이 아니다 — 9/1 입금을 9/5 에 확인하는 일이 보통이다).
  paid_on       date,

  -- ⚠ 입금자명이 회원 이름과 다를 수 있다(가족 계좌, 별명). 총무가 통장에서
  --   못 찾는 순간이 실제로 온다. 그때 "아내 계좌 김영희" 를 적어 두는
  --   자리다. 미납 행에도 적을 수 있다 ("2주 뒤에 낸다고 함").
  --   🔴 이 메모는 운영진 전용이다 — club_dues_summary 는 note 를 돌려주지
  --      않는다. 총무의 사적인 메모가 본인에게 보이면 안 된다.
  note          text check (length(note) <= 100),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (member_id, period_month)
);

create index cd_club_period_idx on club_dues(club_id, period_month);
create index cd_member_idx      on club_dues(member_id);

create trigger cd_updated_at before update on club_dues
  for each row execute function set_updated_at();

comment on table club_dues is
  '월 회비 장부. 돈을 옮기지 않는다 — 총무가 통장을 보고 체크하는 명부다. '
  '🔴 RLS 는 운영진 전용이다. 회원용 창구는 club_dues_summary() 하나뿐이고 '
  '거기서도 합계와 본인 행만 나간다. 미납자 명단이 새면 사람이 나간다.';

comment on column club_dues.paid_on is
  '통장에 들어온 날. null 이면 미납. 체크한 날짜가 아니다 — 누가 언제 '
  '체크했는지는 audit_logs 가 답한다.';

comment on column club_dues.member_name is
  'club_members.display_name 의 스냅샷. 회원이 동아리를 나가도 지난 달 '
  '합계가 안 바뀌게 하려고 둔다 (member_id 는 on delete set null).';

comment on column club_dues.note is
  '입금자명이 회원 이름과 다를 때 통장에서 찾는 실마리. 🔴 운영진 전용 — '
  'club_dues_summary 는 이 값을 돌려주지 않는다.';

-- ── RLS — 운영진 전용. 이 한 줄이 이 기능의 핵심이다 ────────────────
alter table club_dues enable row level security;

-- 🔴 select 정책이 is_club_admin 하나뿐인 것은 빠뜨린 게 아니라 설계다.
--    회원에게 행을 한 줄이라도 열면 "행이 없는 사람 = 미납자" 또는
--    "paid_on 이 null 인 사람 = 미납자" 가 그대로 드러난다.
--    insert/update/delete 정책은 아예 없다 — 아래 RPC 로만 바뀐다
--    (club_members 가 create_club/join_club 로만 생기는 것과 같은 규율).
create policy cd_select_admin on club_dues
  for select to authenticated using (is_club_admin(club_id));

-- ════════════════════════════════════════════════════════════════════
-- 회원용 창구 — 숫자만 나간다
-- ════════════════════════════════════════════════════════════════════
--
-- 🔴 이 함수는 SECURITY DEFINER 라 RLS 를 우회한다. 그래서 여기서 무엇을
--    돌려주는지가 곧 회원이 볼 수 있는 전부다.
--      돌려주는 것 : 이 달의 합계 두 개 + **호출자 본인 행**
--      안 돌려주는 것: 남의 이름, 남의 납부 여부, 인원 수, note
--
--    인원 수(납부 13명 / 미납 3명)를 뺀 이유: 운영진 화면은 테이블을 직접
--    읽어 스스로 세면 되고, 회원에게는 "얼마 걷혔나" 에 필요하지 않다.
--    사람 수가 나가면 작은 동아리에서 한 명씩 좁혀지는 추론이 열린다.
--
--    ⚠ 그래도 회원이 두세 명인 동아리에서는 금액 합계만으로도 서로를
--      추정할 수 있다. 이것은 이 설계가 못 막는 한계다 — 막으려면 최소
--      인원 미만일 때 합계를 숨겨야 하는데, 그건 요구에 없다.
--
--    필드를 하나 늘리는 것이 곧 노출 표면을 넓히는 것이다. 늘리려면
--    smoke-dues 의 "회원에게는 한 행도 안 보인다" 검사부터 고쳐라.
create or replace function club_dues_summary(p_club_id uuid, p_period date)
returns jsonb
language plpgsql security definer stable
set search_path = public, pg_temp as $fn$
declare
  v_period    date;
  v_expected  bigint;
  v_collected bigint;
  v_mine      club_dues;
begin
  if not is_club_member(p_club_id) then
    raise exception '동아리 회원만 볼 수 있습니다' using errcode = '42501';
  end if;

  -- 어떤 날짜가 와도 그 달의 1일로 접는다. 화면이 '2026-09-14' 를 보내도
  -- 9월 장부를 본다.
  v_period := date_trunc('month', coalesce(p_period, current_date))::date;

  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where paid_on is not null), 0)
    into v_expected, v_collected
    from club_dues
   where club_id = p_club_id and period_month = v_period;

  -- 본인 행. 계정 없는 회원은 애초에 로그인을 못 하므로 여기 안 걸린다.
  select d.* into v_mine
    from club_dues d
    join club_members cm on cm.id = d.member_id
   where d.club_id = p_club_id
     and d.period_month = v_period
     and cm.user_id = auth.uid();

  return jsonb_build_object(
    'period_month',    v_period,
    'expected_total',  v_expected,
    'collected_total', v_collected,
    -- note 는 뺀다 (컬럼 주석 참고 — 총무의 사적인 메모다)
    'mine', case when v_mine.id is null then null
                 else jsonb_build_object('id',      v_mine.id,
                                         'amount',  v_mine.amount,
                                         'paid_on', v_mine.paid_on)
            end
  );
end;
$fn$;

comment on function club_dues_summary(uuid, date) is
  '회원용 창구. 이 달의 합계(걷을 돈·걷힌 돈)와 호출자 본인 행만 돌려준다. '
  '🔴 남의 이름·남의 납부 여부·인원 수·메모는 어떤 경우에도 안 나간다. '
  '게스트비가 생기면 여기에 키를 더한다 (jsonb 인 이유).';

-- ════════════════════════════════════════════════════════════════════
-- 운영진용 쓰기 경로 — 값이 실제로 바뀌면 전부 감사로그를 남긴다
-- ════════════════════════════════════════════════════════════════════

-- ── 달 열기 ─────────────────────────────────────────────────────────
-- 재실행 안전하다. 이미 행이 있는 사람은 건드리지 않고(on conflict do
-- nothing) 그 사이에 새로 들어온 회원만 채운다. 그래서 "달 열기" 와
-- "중간에 들어온 사람 추가" 가 같은 함수다 — 총무가 외울 것이 하나 준다.
-- ⚠ 이미 있는 행의 금액을 덮어쓰지 않는 것이 핵심이다. 덮어쓰면 총무가
--   손으로 고쳐 둔 신입 할인이 달을 다시 열 때마다 날아간다.
create or replace function open_dues_month(
  p_club_id uuid, p_period date, p_amount integer
) returns integer
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_period  date;
  v_created integer;
begin
  if not is_club_admin(p_club_id) then
    raise exception '운영진만 회비 장부를 열 수 있습니다' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then
    raise exception '금액이 올바르지 않습니다' using errcode = '22023';
  end if;

  v_period := date_trunc('month', coalesce(p_period, current_date))::date;

  insert into club_dues (club_id, member_id, member_name, period_month, amount)
  select p_club_id, cm.id, cm.display_name, v_period, p_amount
    from club_members cm
   where cm.club_id = p_club_id
  on conflict (member_id, period_month) do nothing;

  get diagnostics v_created = row_count;

  -- 아무도 안 늘었으면 기록하지 않는다. 감사로그에 "안 바뀐 변경" 을
  -- 남기면 나중에 로그를 읽는 사람이 진짜 변경을 못 찾는다
  -- (set_member_grade 와 같은 규율).
  if v_created > 0 then
    perform log_audit_club(p_club_id, 'club_dues.open', 'club_dues', null, null,
                           jsonb_build_object('period_month', v_period,
                                              'amount',       p_amount,
                                              'created',      v_created));
  end if;

  return v_created;
end;
$fn$;

comment on function open_dues_month(uuid, date, integer) is
  '그 달의 회비 행을 회원 전원에게 만든다. 재실행 안전 — 이미 있는 행의 '
  '금액은 덮어쓰지 않으므로 중간에 들어온 사람을 채우는 데도 같은 함수를 쓴다.';

-- ── 납부 체크 / 되돌리기 ────────────────────────────────────────────
-- 판단 4: 이 함수가 양방향인 것이 이 기능이 신뢰받는 이유다. 잘못 눌렀으면
-- 다시 눌러 되돌리고, 되돌렸다는 사실까지 감사로그에 남는다.
create or replace function set_dues_paid(
  p_dues_id uuid, p_paid boolean, p_paid_on date default null
) returns club_dues
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
  v_next   date;
begin
  -- for update: 검사한 뒤 쓰기까지 사이에 다른 운영진이 같은 행을 만지면
  -- 감사로그의 before 가 실제와 어긋난다.
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 납부를 체크할 수 있습니다' using errcode = '42501';
  end if;

  -- 되돌리기는 날짜를 지우는 것이다.
  v_next := case when coalesce(p_paid, false)
                 then coalesce(p_paid_on, current_date)
                 else null end;

  if v_next is not distinct from v_row.paid_on then
    return v_row;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set paid_on = v_next, updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id,
                         case when v_next is null then 'club_dues.unpaid'
                              else 'club_dues.paid' end,
                         'club_dues', p_dues_id, v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

comment on function set_dues_paid(uuid, boolean, date) is
  '납부 체크와 되돌리기. p_paid=false 면 paid_on 을 지운다. 양방향인 것이 '
  '핵심이다 — 되돌릴 수 없으면 총무가 앱을 안 믿는다. 양쪽 다 감사로그에 남는다.';

-- ── 금액 고치기 ─────────────────────────────────────────────────────
-- 판단 2: 신입 할인·반년 선납·휴회는 앱이 모른다. 총무가 여기서 적는다.
create or replace function set_dues_amount(p_dues_id uuid, p_amount integer)
returns club_dues
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 금액을 고칠 수 있습니다' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then
    raise exception '금액이 올바르지 않습니다' using errcode = '22023';
  end if;

  if p_amount = v_row.amount then
    return v_row;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set amount = p_amount, updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id, 'club_dues.set_amount', 'club_dues',
                         p_dues_id, v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

-- ── 메모 ────────────────────────────────────────────────────────────
-- 입금자명이 회원 이름과 다를 때 통장에서 찾는 실마리를 남기는 곳.
-- 빈 문자열은 null 로 떨어뜨린다 — 지우는 경로가 그것이다
-- (set_member_grade 가 '모른다' 로 떨어뜨리는 것과 같은 모양).
create or replace function set_dues_note(p_dues_id uuid, p_note text)
returns club_dues
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
  v_next   text;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 메모를 남길 수 있습니다' using errcode = '42501';
  end if;

  v_next := nullif(btrim(coalesce(p_note, '')), '');
  if length(coalesce(v_next, '')) > 100 then
    raise exception '메모는 100자를 넘을 수 없습니다' using errcode = '22023';
  end if;

  if v_next is not distinct from v_row.note then
    return v_row;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set note = v_next, updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id, 'club_dues.set_note', 'club_dues',
                         p_dues_id, v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

-- ── 항목 빼기 ───────────────────────────────────────────────────────
-- 휴회·중간 탈퇴처럼 이 달에 받을 것이 없는 사람을 '걷을 돈' 합계에서 뺀다.
-- 지우기 전에 통째로 감사로그에 남기므로(before 스냅샷) 잘못 뺐어도 무엇이
-- 있었는지는 남는다. 다시 넣는 길은 open_dues_month 다.
create or replace function remove_dues_entry(p_dues_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row club_dues;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 항목을 뺄 수 있습니다' using errcode = '42501';
  end if;

  perform log_audit_club(v_row.club_id, 'club_dues.remove', 'club_dues',
                         p_dues_id, to_jsonb(v_row), null);
  delete from club_dues where id = p_dues_id;
end;
$fn$;

-- ── 권한 ────────────────────────────────────────────────────────────
-- anon 은 회비를 볼 일이 없다. verify-schema 가 anon 실행 가능 함수를
-- **집합**으로 못 박아 두었으므로, 여기서 새면 db:verify 가 잡는다.
revoke all on function club_dues_summary(uuid, date)          from public, anon;
revoke all on function open_dues_month(uuid, date, integer)   from public, anon;
revoke all on function set_dues_paid(uuid, boolean, date)     from public, anon;
revoke all on function set_dues_amount(uuid, integer)         from public, anon;
revoke all on function set_dues_note(uuid, text)              from public, anon;
revoke all on function remove_dues_entry(uuid)                from public, anon;

grant execute on function club_dues_summary(uuid, date)        to authenticated;
grant execute on function open_dues_month(uuid, date, integer) to authenticated;
grant execute on function set_dues_paid(uuid, boolean, date)   to authenticated;
grant execute on function set_dues_amount(uuid, integer)       to authenticated;
grant execute on function set_dues_note(uuid, text)            to authenticated;
grant execute on function remove_dues_entry(uuid)              to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 만든 것
--   · club_dues 표 (grain: 회원 × 달) + RLS(운영진 전용 select 하나)
--   · club_dues_summary  — 회원용 창구. 합계 + 본인 행. jsonb.
--   · open_dues_month    — 달 열기 겸 중간 합류자 채우기. 재실행 안전.
--   · set_dues_paid      — 납부 체크 **및 되돌리기**. 양방향.
--   · set_dues_amount    — 총무가 금액을 적는 곳. 앱은 계산하지 않는다.
--   · set_dues_note      — 입금자명이 다를 때의 실마리. 운영진 전용.
--   · remove_dues_entry  — 이 달에 받을 것이 없는 사람 빼기.
--   쓰기 5개 전부 audit_logs 에 남는다 (값이 안 바뀌면 안 남긴다).
-- ════════════════════════════════════════════════════════════════════
