import { Modal } from '@/components/ui/Modal'
import { GradePicker } from '@/components/ui/GradePicker'
import { GenderPicker } from '@/components/ui/GenderPicker'
import { useSetMemberGender, useSetMemberGrade } from './queries'
import { toUserMessage } from '@/lib/errors'
import type { MemberSummary } from './api'

/**
 * 명단에서 한 사람의 급수·성별을 고친다.
 *
 * ## 왜 운영진이 남의 값을 채우나
 *
 * 총무는 회원들의 급수와 성별을 **이미 알고 있다.** 회원 하나하나가 직접
 * 적어 넣기를 기다리면 절반이 빈 채로 남고, 그러면 자동 편성이 그 절반을
 * 못 쓴다(성별이 비면 남복·여복·혼복 어디에도 못 들어간다). 아는 사람이
 * 한자리에서 채우는 편이 현실에 맞다.
 *
 * 서버는 **본인 또는 그 대회의 운영진**만 통과시키고, 남의 값을 바꾸면
 * 감사로그를 남긴다(`set_member_grade` · `set_member_gender`,
 * 20260902000001). 화면은 버튼을 안 그릴 뿐이고 진짜 벽은 거기다.
 *
 * ## 왜 저장 버튼이 없나
 *
 * 고르는 즉시 보낸다. 서버 함수가 애초에 **한 칸씩** 바꾸도록 나뉘어 있어
 * (급수 하나 · 성별 하나) 모아 보낼 것이 없고, 총무는 명단을 훑으며 여러
 * 사람을 연달아 고친다 — 사람마다 저장을 한 번 더 누르게 하면 그 탭이
 * 인원수만큼 쌓인다.
 *
 * ## 왜 명단의 값이지 프로필의 값이 아닌가
 *
 * 명단 행의 급수·성별은 들어올 때 찍힌 **스냅샷**이다. 여기서 남의 프로필을
 * 고치면 그 사람의 지난 대회 명단까지 소급해 바뀌고, 애초에 남의 profiles
 * 는 RLS 가 읽지도 쓰지도 못하게 막아 뒀다(`profiles_select_own`).
 * 그래서 이 화면이 바꾸는 것은 언제나 **이 명단에서의 값** 하나다.
 */
export function MemberTraitsModal({
  tournamentId,
  member,
  onClose,
}: {
  tournamentId: string
  /** null 이면 닫힌 상태다 — 목록 줄마다 다이얼로그를 하나씩 두지 않는다 */
  member: MemberSummary | null
  onClose: () => void
}) {
  const setGrade = useSetMemberGrade(tournamentId)
  const setGender = useSetMemberGender(tournamentId)

  const busy = setGrade.isPending || setGender.isPending
  const error = setGrade.error ?? setGender.error

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title={member ? `${member.displayName} 급수·성별` : '급수·성별'}
    >
      {member && (
        <div className="flex flex-col gap-5">
          <GradePicker
            value={member.grade}
            onChange={(grade) => setGrade.mutate({ memberId: member.id, grade })}
            size="lg"
            disabled={busy}
            hint="'모름' 을 고르면 비워집니다."
          />
          <GenderPicker
            value={member.gender}
            onChange={(gender) => setGender.mutate({ memberId: member.id, gender })}
            size="lg"
            disabled={busy}
            hint="비어 있으면 남복·여복·혼복 편성에서 빠집니다."
          />

          {error && (
            <p role="alert" className="text-sm font-medium text-team-b-fg">
              {toUserMessage(error, '바꾸지 못했습니다')}
            </p>
          )}

          {/*
            "이 명단에서만" 을 적어 둔다. 프로필까지 바뀌는 줄 알고 남의
            급수를 고쳐 주는 것과, 오늘 명단만 바뀐다는 것을 알고 고치는
            것은 다른 행동이다.
          */}
          <p className="text-xs text-ink-3">
            이 명단에서만 바뀝니다. 그 사람의 계정 정보와 지난 대회 명단은 그대로예요.
          </p>
        </div>
      )}
    </Modal>
  )
}
