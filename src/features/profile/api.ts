import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { parseGrade } from '@/lib/grade'
import { parseGender } from '@/lib/gender'
import type { PlayerGender, PlayerGrade } from '@/types/database'

/**
 * 내 계정 정보 — 마이페이지(`/me`)가 읽고 쓰는 유일한 곳.
 *
 * ## 왜 RPC 가 아니라 직접 UPDATE 인가
 *
 * `profiles` 에는 **본인만** 통과하는 RLS 가 이미 서 있다
 * (`profiles_select_own` · `profiles_update_own`, 20260818000002_rls.sql).
 * 남의 행은 조회도 수정도 애초에 0행이라, RPC 로 한 겹 더 감싸도
 * 서버가 더 검사할 것이 없다 — 감쌀 규칙이 없는데 감싸면 그 함수가
 * 무엇을 지키는지 아무도 설명할 수 없게 된다.
 *
 * 명단 쪽(`set_member_grade` · `set_member_gender`)이 RPC 인 것과 대비된다.
 * 그쪽은 "본인 또는 **운영진**" 이라는 규칙과 감사로그가 필요해서 RLS
 * 하나로는 표현이 안 된다.
 *
 * ## ⚠ PostgREST 는 0행이어도 200 이다
 *
 * RLS 에 걸려 아무 행도 안 바뀌어도 성공으로 응답한다. `single()` 을 붙여
 * **행 수로 판정**한다 — 안 붙이면 "저장했습니다" 를 띄워 놓고 아무것도
 * 안 바뀐 상태가 된다.
 */
export interface MyProfile {
  id: string
  name: string
  /**
   * 계정의 급수 — **정본이지만 명단으로 따라가지는 않는다.**
   *
   * 이미 들어간 명단(`tournament_members.grade`)은 들어올 때 찍힌 스냅샷이라
   * 여기를 고쳐도 안 바뀐다(20260901000001). 다음에 새로 들어가는 명단부터
   * 새 값을 가져간다. 오늘 모임의 내 값을 고치려면 명단 화면에서 고친다.
   */
  grade: PlayerGrade | null
  /** 계정의 성별. `grade` 와 똑같은 스냅샷 규율이다 (20260902000001) */
  gender: PlayerGender | null
}

/** 서버가 준 급수·성별을 믿지 않고 판별한다 — 이유는 parseGrade 주석 */
function toProfile(row: { id: string; name: string; grade: unknown; gender: unknown }): MyProfile {
  return {
    id: row.id,
    name: row.name,
    grade: parseGrade(row.grade),
    gender: parseGender(row.gender),
  }
}

export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const res = await supabase
    .from('profiles')
    .select('id, name, grade, gender')
    .eq('id', userId)
    .single()
  return toProfile(unwrap(res) as { id: string; name: string; grade: unknown; gender: unknown })
}

export interface MyProfilePatch {
  name: string
  /** null 은 '모른다' 다 — 잘못 고른 것을 되돌리는 경로가 이것뿐이다 */
  grade: PlayerGrade | null
  gender: PlayerGender | null
}

export async function updateMyProfile(userId: string, patch: MyProfilePatch): Promise<MyProfile> {
  const res = await supabase
    .from('profiles')
    .update({ name: patch.name, grade: patch.grade, gender: patch.gender })
    .eq('id', userId)
    // single() 이 있어야 RLS 로 0행이 걸러진 경우를 오류로 잡는다 (머리 주석)
    .select('id, name, grade, gender')
    .single()
  return toProfile(unwrap(res) as { id: string; name: string; grade: unknown; gender: unknown })
}
