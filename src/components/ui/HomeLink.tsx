import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 메인 화면. 여기 말고 다른 곳에서 '/' 를 직접 적지 않는다. */
export const HOME_PATH = '/'

/**
 * 메인으로 한 번에 나가는 버튼.
 *
 * 뒤로가기는 온 길을 **한 칸씩** 되짚는다(BackLink 주석 참고). 방금 보던
 * 곳으로 돌아갈 때는 그게 맞지만, 동아리 명단(`/c/:id/members`)이나 관리
 * 하위 화면에서 메인까지 가려면 서너 번을 눌러야 한다. **되짚어 나가는
 * 것과 처음으로 돌아가는 것은 다른 일이라** 버튼도 따로 둔다. 뒤로가기는
 * 그대로 두고 여기에 하나를 더할 뿐이다.
 *
 * ## 히스토리를 쌓지 않는다 — `replace`
 *
 * `<Link to="/">` 로 두면 누를 때마다 히스토리가 한 칸씩 자란다. 아이폰
 * 홈 화면에 추가해 쓰는 사람에게(알림 때문에 우리가 그렇게 안내한다) 그
 * 스택은 눈에 안 보이지만 안드로이드 뒤로가기 · 가장자리 스와이프가
 * 그대로 따라간다. 메인이 스택 꼭대기에 계속 얹히면, 앱을 닫으려고
 * 뒤로를 누르는 사람이 방금 떠난 대회 화면으로 되돌아온다.
 *
 * `replace` 는 지금 화면을 메인으로 **갈아끼운다.** 스택은 자라지 않고,
 * 뒤로가기는 "메인에 오기 전" 이 아니라 "그 화면에 들어오기 전" 으로
 * 간다 — 메인으로 나온 사람이 뒤로를 눌러 그 깊은 화면으로 다시 빨려
 * 들어가지 않는다. 게스트 등록 화면이 자동 이동에 `push` 를 쓰지 않는
 * 것(GuestJoinPage 주석 '무한 왕복')과 같은 이유다.
 *
 * ## 아이콘만 두지 않는다
 *
 * 집 그림 하나만으로는 "홈이 어디냐" 를 사람마다 다르게 읽는다. 글자를
 * 같이 둔다(docs/design.md — 색·그림만으로 뜻을 말하지 않는다). 그래도
 * `aria-label` 은 따로 단다: 화면에 보이는 '홈' 은 짧아서 화면 낭독기로
 * 훑을 때 무엇을 하는 버튼인지 덜 분명하다. 보이는 글자를 그대로 품는
 * 문구라야 음성으로 "홈" 이라고 말했을 때도 이 버튼이 잡힌다.
 *
 * 탭 영역은 BackLink 와 같은 48px 다. 오른쪽 마이너스 마진으로 글자
 * 위치는 유지한 채 표적만 키운다.
 */
export function HomeLink({ className }: { className?: string }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(HOME_PATH, { replace: true })}
      aria-label="홈으로 가기"
      className={cn(
        '-mr-3 inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-3',
        'text-sm font-medium text-ink-2 transition-colors hover:text-ink-1',
        // 눌렀다는 표시. 폰에서는 hover 가 없다.
        'active:bg-surface-2 active:text-ink-1',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      <Home className="size-4 shrink-0" aria-hidden />홈
    </button>
  )
}
