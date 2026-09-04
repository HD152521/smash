import { supabase } from '@/lib/supabase'
import { unwrap, unwrapVoid } from '@/lib/errors'
import { monthStart } from '@/lib/dues'
import type { DuesEntry } from '@/lib/dues'
import type { ClubDuesSummary } from '@/types/database'

/**
 * 월 회비 장부의 서버 경로.
 *
 * ## 두 길이 있고, 그 둘이 갈린 것이 이 기능의 보안 설계다
 *
 * · 운영진 : `club_dues` 테이블을 **직접 읽는다.** RLS 정책
 *   `cd_select_admin` 이 `is_club_admin(club_id)` 하나뿐이라, 운영진에게만
 *   행이 온다.
 * · 회원   : `club_dues_summary` RPC **하나만** 부른다. 같은 테이블을
 *   조회하면 0행이 온다(오류가 아니라 0행이다 — 아래 ⚠ 참고).
 *
 * 🔴 이 갈림을 없애지 마라. 회원에게 행을 한 줄이라도 열면 "행이 없는
 *    사람" 또는 "paid_on 이 null 인 사람" 이 곧 미납자 명단이 된다.
 *    동아리에서 그게 공개되면 실제로 사람이 나간다.
 *
 * ⚠ PostgREST 는 RLS 로 0행이 걸러져도 200 을 준다. 그래서 여기서는
 *   성패를 상태 코드가 아니라 **행 수**로 판정한다 — 쓰기 경로를 전부
 *   RPC 로 둔 것도 같은 이유다(RPC 는 권한이 없으면 예외를 던진다).
 */

/**
 * 그 동아리 · 그 달의 장부 전체. **운영진만** 행을 받는다.
 *
 * 뺀 사람(`removed_at`)도 함께 가져온다. 합계에는 안 들지만 화면 아래
 * 「뺀 사람」 칸에 남아 있어야 잘못 뺐을 때 되돌릴 수 있다 —
 * 감사로그에 남아 있다는 말은 총무에게 아무 도움이 안 된다.
 */
export async function fetchDuesEntries(clubId: string, monthKey: string): Promise<DuesEntry[]> {
  const res = await supabase
    .from('club_dues')
    .select('id, member_id, member_name, amount, paid_on, note, removed_at')
    .eq('club_id', clubId)
    .eq('period_month', monthStart(monthKey))
  const rows = unwrap(res)
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name,
    amount: r.amount,
    paidOn: r.paid_on,
    note: r.note,
    removedAt: r.removed_at,
  }))
}

/**
 * 회원용 창구 — 합계 둘과 본인 행.
 *
 * 운영진도 이 값을 쓴다(합계를 화면에서 다시 더하지 않기 위해서가 아니라,
 * 회원과 **같은 숫자**를 보게 하기 위해서다. 두 곳에서 따로 더하면 언젠가
 * 어긋나고, 그때 총무는 어느 쪽이 맞는지 알 방법이 없다).
 */
export async function fetchDuesSummary(
  clubId: string,
  monthKey: string,
): Promise<ClubDuesSummary> {
  const res = await supabase.rpc('club_dues_summary', {
    p_club_id: clubId,
    p_period: monthStart(monthKey),
  })
  return unwrap(res)
}

/** 그 달 장부 열기. 이미 있는 행은 안 건드린다 — 새로 만든 수를 돌려준다 */
export async function openDuesMonth(
  clubId: string,
  monthKey: string,
  amount: number,
): Promise<number> {
  const res = await supabase.rpc('open_dues_month', {
    p_club_id: clubId,
    p_period: monthStart(monthKey),
    p_amount: amount,
  })
  return unwrap(res)
}

/**
 * 납부 체크와 되돌리기. 되돌리기가 있는 것이 이 기능이 신뢰받는 이유다.
 *
 * ⚠ 입금일을 **화면이 보낸다.** 서버에 맡기면 DB 세션 타임존(실측 UTC)의
 *   오늘이 찍히는데, 총무가 보는 달력은 기기 시간대다. KST 9월 1일 아침
 *   8시 체크가 8월 31일로 저장되면 9월 장부의 줄에 8월 날짜가 남고,
 *   총무가 통장과 맞춰볼 때 하루가 어긋난다. 서버 기본값도 KST 로 고쳐
 *   뒀지만(20260904000002), 진짜 답은 **그 기기의 오늘**이다.
 */
export async function setDuesPaid(duesId: string, paid: boolean): Promise<void> {
  const res = await supabase.rpc('set_dues_paid', {
    p_dues_id: duesId,
    p_paid: paid,
    p_paid_on: paid ? localToday() : null,
  })
  unwrap(res)
}

/** 이 기기의 오늘 — 'YYYY-MM-DD'. toISOString 은 UTC 라 쓰면 안 된다 */
function localToday(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export async function setDuesAmount(duesId: string, amount: number): Promise<void> {
  const res = await supabase.rpc('set_dues_amount', { p_dues_id: duesId, p_amount: amount })
  unwrap(res)
}

/** 빈 문자열을 보내면 서버가 메모를 지운다 */
export async function setDuesNote(duesId: string, note: string): Promise<void> {
  const res = await supabase.rpc('set_dues_note', { p_dues_id: duesId, p_note: note })
  unwrap(res)
}

/**
 * 이 달 회비에서 빼기. **낸 사람은 서버가 거절한다** — 들어온 돈의 기록을
 * 지우는 것은 「빼기」가 아니라 납부 되돌리기의 몫이기 때문이다.
 * 지우지 않고 표시만 하므로 `restoreDuesEntry` 로 그대로 되돌아온다.
 */
export async function removeDuesEntry(duesId: string): Promise<void> {
  const res = await supabase.rpc('remove_dues_entry', { p_dues_id: duesId })
  unwrapVoid(res)
}

/**
 * 뺀 사람을 다시 넣기. **그 행을 살린다** — 새로 만드는 것이 아니다.
 *
 * 그래서 총무가 손으로 고친 금액도, 메모도, 이미 명단에서 나간 사람이라는
 * 사실도 그대로 돌아온다. `openDuesMonth`(«빠진 사람 채우기»)로는 그 달
 * 최빈값의 **새 행**이 생길 뿐이고, 명단에 없는 사람은 아예 못 만든다.
 */
export async function restoreDuesEntry(duesId: string): Promise<void> {
  const res = await supabase.rpc('restore_dues_entry', { p_dues_id: duesId })
  unwrap(res)
}
