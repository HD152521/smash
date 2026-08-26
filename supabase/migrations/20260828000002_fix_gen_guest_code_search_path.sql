-- ════════════════════════════════════════════════════════════════════
-- gen_guest_code 가 gen_random_bytes 를 못 찾는 것을 고친다
--
-- 20260828000001 의 gen_guest_code 는 `set search_path = public, pg_temp`
-- 로 잠가 두고 본문에서 gen_random_bytes(22) 를 부른다. 그런데 이 함수는
-- pgcrypto 것이고, Supabase 는 확장을 public 이 아니라 **extensions**
-- 스키마에 설치한다. 그래서 잠근 search_path 에서는 보이지 않고
-- `function gen_random_bytes(integer) does not exist` 로 죽는다.
--
-- 20260818000001 의 `create extension if not exists "pgcrypto"` 를 보고
-- "확장이 있으니 함수도 보인다" 고 넘겨짚은 것이 원인이다. 확장이
-- 설치돼 있다는 것과 내 search_path 에서 보인다는 것은 다른 말이다.
--
-- gen_random_uuid() 가 멀쩡히 돌아서 더 늦게 발견됐다. 그건 PG13+ 의
-- 코어 내장 함수라 pgcrypto 와 무관하다.
--
-- ── 무엇이 깨져 있었나 ──────────────────────────────────────────────
--
-- gen_guest_code 는 create_club 안에서 불린다. 즉 이 버그는 게스트
-- 기능만이 아니라 **동아리 생성 전체**를 막고 있었다. db:smoke:club 이
-- 첫 항목에서 잡았다.
--
-- ── 고치는 방법 ─────────────────────────────────────────────────────
--
-- search_path 에 extensions 를 더한다. 호출부를 extensions.gen_random_bytes
-- 로 스키마 한정하는 방법도 있지만, 이 저장소의 다른 함수들이 전부
-- `set search_path = ...` 로 잠그는 형태라 그 관례를 따른다. pg_temp 는
-- 맨 뒤에 그대로 둔다 — 임시 스키마가 앞에 오면 같은 이름의 임시 객체로
-- 함수를 가로챌 수 있다.
--
-- create_club 은 본문이 바뀌지 않았으므로 다시 만들지 않는다.
-- gen_guest_code 를 고치면 그 안에서 부르는 쪽도 함께 낫는다.
-- ════════════════════════════════════════════════════════════════════

create or replace function gen_guest_code() returns text
language plpgsql volatile
set search_path = public, extensions, pg_temp as $fn$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  raw      bytea;
  result   text := '';
begin
  raw := gen_random_bytes(22);
  for i in 1..22 loop
    result := result || substr(alphabet, 1 + (get_byte(raw, i - 1) % length(alphabet)), 1);
  end loop;
  return result;
end;
$fn$;

revoke all on function gen_guest_code() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 고친 것
--   - gen_guest_code 의 search_path 에 extensions 추가
--     (pgcrypto 의 gen_random_bytes 를 찾지 못해 create_club 이 통째로
--      실패하던 것을 고친다)
-- ════════════════════════════════════════════════════════════════════
