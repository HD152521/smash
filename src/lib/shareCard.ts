/**
 * 카톡·페북 미리보기 카드에 실을 문구를 만든다.
 *
 * ── 왜 이 파일이 따로 있는가 ─────────────────────────────────────────
 *
 * 카드를 그리는 곳은 `api/share.ts`(Vercel Edge Function)다. 그런데 그
 * 파일은 배포된 뒤에야 도는 코드라 **단위 테스트가 닿기 어렵다.** 카드의
 * 위험은 성능이 아니라 노출이므로("무엇이 실렸나"), 판단은 전부 여기
 * 순수 함수로 내려와 있어야 `shareCard.test.ts` 가 전수로 검사할 수 있다.
 * `api/share.ts` 는 인자를 모으고 응답을 만드는 얇은 연결부로만 둔다.
 *
 * ── 카드는 곧 유출이다 ───────────────────────────────────────────────
 *
 * 게스트 링크는 카톡으로 전달되면 아무나 본다. 그래서 이 파일이 지키는
 * 규율은 `20260829000001_guest_board.sql` 의 「싣는 것 / 안 싣는 것」 표와
 * **같은 것**이다. 서버가 이미 걸러 보낸 봉투에서 다시 한 번 좁힌다:
 *
 *   ✅ 싣는다 — 동아리 이름 · 모임 이름 · 시각 · 코트 수 · 경기 수(숫자)
 *   🚫 안 싣는다 — 사람 이름(`players_a`/`players_b`) · 명단 · id ·
 *                  초대 코드 · 게스트 코드 · 점수 · 개인을 가리키는 무엇이든
 *
 * 두 빌더는 **키를 이름으로 하나씩 꺼내 쓴다.** 봉투를 통째로 문자열에
 * 붓는 경로가 한 줄도 없어서, 서버가 나중에 필드를 하나 늘려도 카드에는
 * 저절로 실리지 않는다. 늘리려면 이 파일을 고쳐야 하고, 고치면 테스트
 * (「카드 전수 검사」)가 먼저 막는다.
 *
 * ── og:url 을 일부러 안 싣는다 ───────────────────────────────────────
 *
 * 주소에 이미 게스트 코드가 들어 있다. og:url 로 한 번 더 적으면 카드
 * 화면을 캡처했을 때 링크가 새는 경로가 하나 더 생긴다. 크롤러는 og:url
 * 이 없으면 자기가 요청한 주소를 그대로 쓰므로 없어도 아무것도 안 깨진다.
 */

export interface ShareCard {
  title: string
  description: string
}

/**
 * 기본 카드 — 게스트 링크가 아닌 **모든** 주소가 받는 카드.
 *
 * 로그인해야 보이는 화면(`/t/:id` 등)이 여기 포함된다. 그 화면들의 이름을
 * 카드에 실으면 로그인 벽이 막고 있던 것을 카드가 대신 알려 주는 셈이 된다
 * — 카톡으로 전달된 링크는 회원이 아닌 사람도 받는다. 그리고 애초에
 * anon 이 그 데이터에 닿는 경로가 없다(anon RPC 셋은 전부 게스트 전용이다).
 * 이유가 둘이라 어느 한쪽이 바뀌어도 판단은 그대로다.
 */
export const DEFAULT_CARD: ShareCard = {
  title: 'SMASH — 배드민턴 대회 운영',
  description: '대진표, 실시간 점수, 조별 순위를 코트에서 바로 관리하는 배드민턴 대회 운영 앱',
}

/** 카톡 카드에서 잘리지 않는 대략의 상한. 넘으면 말줄임표로 끊는다 */
const TITLE_MAX = 60
const DESCRIPTION_MAX = 120

const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f], // C0 제어문자
  [0x007f, 0x009f], // DEL + C1 제어문자
  [0x200b, 0x200f], // 폭 없는 공백 · 방향 표시
  [0x202a, 0x202e], // 방향 재정렬(LRE~RLO)
  [0x2060, 0x2064], // 폭 없는 결합자
  [0xfeff, 0xfeff], // BOM
]

const hex4 = (n: number): string => n.toString(16).padStart(4, '0')

/**
 * 제어문자·제로폭·방향 재정렬 문자를 지우는 정규식.
 *
 * `src/lib/guest.ts` 의 같은 상수와 목적이 다르다 — 저기는 입력 검증이고
 * 여기는 **출력 소독**이다. 모임 이름은 사람이 자유롭게 적는 칸이고, 그 값이
 * 지금 HTML 메타 태그의 속성값 안으로 들어간다. 방향 재정렬 문자 하나로 카드
 * 문구가 거꾸로 읽히게 만들 수 있으므로 지우고 내보낸다.
 *
 * ⚠ 정규식 리터럴로 쓰지 않고 코드포인트에서 조립한다. 이 파일에 보이지 않는
 *   문자를 리터럴로 적으면 편집기·도구를 거치며 조용히 다른 문자로 바뀌거나
 *   사라져도 아무도 못 알아챈다 — 소독기가 소독을 멈춘 것을 눈으로 확인할 수
 *   없다는 뜻이다. 위 표는 16진수라 눈으로 검증된다.
 */
const CONTROL_AND_INVISIBLE_CHARS = new RegExp(
  `[${INVISIBLE_RANGES.map(([lo, hi]) => `\\u${hex4(lo)}-\\u${hex4(hi)}`).join('')}]`,
  'g',
)

/**
 * 서버가 준 자유 입력 문자열을 카드에 실을 수 있는 모양으로 좁힌다.
 *
 * 문자열이 아니면(서버가 봉투 모양을 바꿨거나 응답이 망가졌으면) 빈
 * 문자열이다 — 그러면 호출부가 기본 카드로 떨어진다. **모르는 값을 조용히
 * 통과시키는 경로를 두지 않는다.**
 */
export function safeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(CONTROL_AND_INVISIBLE_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return ''
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1).trimEnd()}…`
}

/** 메타 태그 속성값 안에 들어가므로 따옴표까지 전부 실체 참조로 바꾼다 */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 음이 아닌 정수만. 그 외에는 null 이라 호출부가 그 조각을 통째로 뺀다 */
function safeCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.trunc(value)
  return n >= 0 ? n : null
}

const WEEKDAY_KO: Record<string, string> = {
  Sun: '일',
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
}

/**
 * 모임 시각을 한국 시간으로 적는다 — `9월 2일 (수) 오후 7:30`.
 *
 * ⚠ 카드를 그리는 서버의 시간대는 우리 것이 아니다(Vercel Edge 는 UTC 다).
 *   `timeZone: 'Asia/Seoul'` 을 빼면 저녁 7시 모임이 카드에 오전 10시로
 *   찍힌다 — 카드는 받은 사람이 고쳐 볼 방법이 없으니 조용히 틀린 채로
 *   퍼진다.
 *
 * ⚠ 한국어 조립을 `ko-KR` 로케일에 맡기지 않는다. 로케일 문자열은 런타임의
 *   CLDR 판본에 따라 달라진다 — 실제로 이 저장소의 Node 에서 `ko-KR` 이
 *   「오후 7:30」이 아니라 「PM 7:30」을 냈다. 배포되는 Edge 런타임은 또
 *   다른 판본이고, 카드는 한 번 퍼지면 고칠 수가 없다. 그래서 숫자만
 *   `Intl` 에서 받고(시간대 변환이 그 부분의 일이다) 「월·일·요일·오전/오후」
 *   글자는 여기서 붙인다.
 */
export function formatSessionTime(startsAt: unknown): string {
  if (typeof startsAt !== 'string' || startsAt.length === 0) return ''
  const at = new Date(startsAt)
  if (Number.isNaN(at.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  const hour = Number(get('hour'))
  if (!Number.isFinite(hour)) return ''
  const period = hour < 12 ? '오전' : '오후'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  const weekday = WEEKDAY_KO[get('weekday')] ?? ''
  const day = weekday === '' ? `${get('month')}월 ${get('day')}일` : `${get('month')}월 ${get('day')}일 (${weekday})`

  return `${day} ${period} ${hour12}:${get('minute')}`
}

/**
 * `/g/:guestCode` — 게스트 등록 화면의 카드. `guest_sessions` 봉투를 받는다.
 *
 * 총무가 매주 카톡에 붙이는 바로 그 링크라 이 앱에서 값이 가장 큰 카드다.
 * 받는 사람이 알아야 하는 것은 셋이다 — **어느 동아리인가 · 언제인가 ·
 * 눌러서 무엇을 하나.** 그래서 문구가 「이름만 적으면」 으로 끝난다.
 *
 * `ok:false`(코드가 틀림 · 열린 모임 없음)면 기본 카드다. 실패 이유를
 * 카드에 적으면 22자 코드를 넣어 보며 「이 동아리가 있나」 를 알아내는
 * 탐색기가 된다 — 서버가 오류를 일부러 뭉뚱그린 것과 같은 이유다.
 */
export function buildGuestJoinCard(payload: unknown): ShareCard {
  if (!isRecord(payload) || payload['ok'] !== true) return DEFAULT_CARD

  const clubName = safeText(payload['club_name'], TITLE_MAX)
  if (clubName === '') return DEFAULT_CARD

  const sessions = payload['sessions']
  const list = Array.isArray(sessions) ? sessions.filter(isRecord) : []
  if (list.length === 0) return DEFAULT_CARD

  const cta = '이름만 적으면 참가 완료 — 가입도 로그인도 필요 없습니다'

  // 모임이 하나면 그 모임을 그대로 말한다. 카드는 두 줄이 전부라
  // 「골라야 한다」 는 말이 필요 없는 경우에 넣으면 그만큼 손해다.
  if (list.length === 1) {
    const only = list[0]
    const sessionName = safeText(only?.['name'], TITLE_MAX)
    const at = formatSessionTime(only?.['starts_at'])
    const title = sessionName === '' ? `${clubName} 모임 참가` : `${clubName} · ${sessionName}`
    return {
      title: safeText(title, TITLE_MAX),
      description: safeText(at === '' ? cta : `${at} · ${cta}`, DESCRIPTION_MAX),
    }
  }

  return {
    title: safeText(`${clubName} 모임 참가`, TITLE_MAX),
    description: safeText(
      `열린 모임 ${list.length}개 · 참가할 모임을 고르고 ${cta}`,
      DESCRIPTION_MAX,
    ),
  }
}

/**
 * `/g/:guestCode/:sessionId` — 게스트 현황판의 카드. `guest_board` 봉투를 받는다.
 *
 * ⚠ `matches[].players_a` · `players_b` 에 **그날 코트에 선 사람 이름이
 *   들어 있다.** 이 함수는 그 배열을 읽지 않는다 — 개수를 세는 데도 쓰지
 *   않는다. 세는 순간 다음 사람이 「이름도 하나쯤은」 으로 넘어간다.
 *   싣는 것은 코트 수와 경기 수, 즉 사람을 가리키지 않는 숫자뿐이다.
 *   점수도 안 싣는다 — 화면에서는 위험하지 않지만 카드는 그 경기와 무관한
 *   사람에게까지 가고, 거기서는 알 이유가 없는 숫자다.
 */
export function buildGuestBoardCard(payload: unknown): ShareCard {
  if (!isRecord(payload) || payload['ok'] !== true) return DEFAULT_CARD

  const clubName = safeText(payload['club_name'], TITLE_MAX)
  if (clubName === '') return DEFAULT_CARD

  const session = isRecord(payload['session']) ? payload['session'] : {}
  const sessionName = safeText(session['name'], TITLE_MAX)
  const title = safeText(
    sessionName === '' ? `${clubName} 모임 현황` : `${sessionName} 현황`,
    TITLE_MAX,
  )

  const finished = safeCount(payload['finished_count'])

  // 끝난 모임에 「진행 중 0경기 · 대기 0경기」 라고 적으면 코트가 비었다는
  // 뜻인지 모임이 끝났다는 뜻인지 카드만 봐서는 구별이 안 된다.
  if (session['status'] === 'finished') {
    const total = finished === null ? '' : ` · 총 ${finished}경기`
    return { title, description: safeText(`${clubName} · 마친 모임${total}`, DESCRIPTION_MAX) }
  }

  const courts = Array.isArray(payload['courts']) ? payload['courts'].length : 0
  const matches = Array.isArray(payload['matches']) ? payload['matches'].filter(isRecord) : []
  const live = matches.filter((m) => m['status'] === 'live').length
  const queued = matches.filter((m) => m['status'] === 'scheduled').length

  const parts = [clubName, `코트 ${courts}면`, `진행 중 ${live}경기`, `대기 ${queued}경기`]
  if (finished !== null && finished > 0) parts.push(`끝난 경기 ${finished}`)

  return { title, description: safeText(parts.join(' · '), DESCRIPTION_MAX) }
}

/**
 * 카드 블록의 경계.
 *
 * `index.html` 이 이 두 주석 사이에 기본 카드를 들고 있고, 크롤러 응답은
 * 그 사이만 통째로 갈아 끼운다. `</head>` 앞에 덧붙이는 방식이 아니라
 * **교체**인 이유는, 덧붙이면 og:title 이 문서에 둘이 되고 어느 것을 쓸지가
 * 크롤러마다 갈리기 때문이다.
 */
export const CARD_MARK_START = '<!-- share-card:start -->'
export const CARD_MARK_END = '<!-- share-card:end -->'

/**
 * 카드 하나를 메타 태그 묶음으로 그린다.
 *
 * `<title>` 과 `<meta name="description">` 까지 이 블록 안에 든다 — og 를
 * 안 읽는 크롤러와 읽는 크롤러가 서로 다른 문구를 보게 두지 않기 위해서다.
 * 한 군데서만 바뀌면 한쪽이 조용히 옛 문구로 남는다.
 */
export function renderCardMeta(card: ShareCard, imageUrl: string): string {
  const title = escapeAttribute(safeText(card.title, TITLE_MAX) || DEFAULT_CARD.title)
  const description = escapeAttribute(
    safeText(card.description, DESCRIPTION_MAX) || DEFAULT_CARD.description,
  )
  const image = escapeAttribute(imageUrl)
  return [
    CARD_MARK_START,
    `    <title>${title}</title>`,
    `    <meta name="description" content="${description}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="SMASH" />`,
    `    <meta property="og:locale" content="ko_KR" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:image" content="${image}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${image}" />`,
    `    ${CARD_MARK_END}`,
  ].join('\n')
}

/**
 * 빌드된 `index.html` 의 카드 블록을 갈아 끼운다.
 *
 * 경계 주석을 못 찾으면 **원본을 그대로 돌려준다.** 던지지 않는 것이
 * 중요하다 — 이 경로의 실패는 「카드가 기본값으로 나온다」 여야지 「링크가
 * 안 열린다」 가 되면 안 된다. index.html 을 고치다 주석을 지운 사람이
 * 앱 전체를 멈추게 만들 수는 없어야 한다.
 */
export function injectCardMeta(html: string, meta: string): string {
  const start = html.indexOf(CARD_MARK_START)
  if (start === -1) return html
  const end = html.indexOf(CARD_MARK_END, start)
  if (end === -1) return html
  return html.slice(0, start) + meta.trimStart() + html.slice(end + CARD_MARK_END.length)
}
