-- ════════════════════════════════════════════════════════════════════
-- 함수 실행 권한 잠금
--
-- 왜 필요한가:
--   Supabase 는 public 스키마에 기본 권한(default privileges)을 걸어 두어,
--   새로 만든 함수에 anon / authenticated 의 EXECUTE 를 자동으로 부여한다.
--   그래서 `revoke all ... from public` 만으로는 부족하다.
--   PUBLIC 에서 걷어내도 anon 에게 직접 부여된 권한이 그대로 남는다.
--
-- 무엇을 막는가:
--   1. anon(비로그인)이 RPC 를 호출하는 것
--      → 각 함수가 auth.uid() null 검사로 스스로 막긴 하지만,
--        방어는 겹쳐 놓아야 나중에 검사를 빠뜨린 함수가 생겨도 안전하다.
--   2. ★ log_audit / gen_invite_code 를 앱 사용자가 직접 호출하는 것
--      → log_audit 이 열려 있으면 로그인한 사용자가 감사 로그를 위조할 수 있다.
--        분쟁 해결의 근거가 되는 기록이므로 내부 전용이어야 한다.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. 내부 전용 함수: anon / authenticated 모두 차단 ───────────────
-- 다른 SECURITY DEFINER 함수 안에서만 호출된다.
revoke all on function log_audit(uuid, text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function gen_invite_code()
  from public, anon, authenticated;

-- ── 2. RLS 헬퍼: 정책 평가용. anon 은 호출할 이유가 없다 ────────────
revoke all on function is_tournament_member(uuid)     from anon;
revoke all on function is_tournament_admin(uuid)      from anon;
revoke all on function is_tournament_owner(uuid)      from anon;
revoke all on function is_match_referee(uuid)         from anon;
revoke all on function match_tournament_id(uuid)      from anon;
revoke all on function match_team_tournament_id(uuid) from anon;
revoke all on function my_member_id(uuid)             from anon;

-- ── 3. RPC: 로그인한 사용자만 ───────────────────────────────────────
revoke all on function create_tournament(text, text, int, int, text, int, int) from anon;
revoke all on function join_tournament(text, text)                             from anon;
revoke all on function set_my_group(uuid, uuid)                                from anon;
revoke all on function start_match(uuid)                                       from anon;
revoke all on function record_score(uuid, team_side, int, text)                from anon;
revoke all on function undo_score(uuid)                                        from anon;
revoke all on function finish_match(uuid, team_side)                           from anon;
revoke all on function reopen_match(uuid)                                      from anon;
revoke all on function create_match(uuid, uuid, text, uuid, uuid[], uuid, uuid[], uuid[]) from anon;
revoke all on function set_tournament_status(uuid, tournament_status)          from anon;
revoke all on function regenerate_invite_code(uuid)                            from anon;
revoke all on function get_standings(uuid)                                     from anon;

-- ── 4. 앞으로 만들 함수에도 같은 규칙이 자동 적용되게 한다 ──────────
-- 이걸 걸어 두지 않으면 다음에 함수를 추가할 때마다 같은 구멍이 다시 생긴다.
alter default privileges in schema public revoke execute on functions from anon;
