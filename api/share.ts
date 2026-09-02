import {
  buildGuestBoardCard,
  buildGuestJoinCard,
  DEFAULT_CARD,
  injectCardMeta,
  renderCardMeta,
  type ShareCard,
} from '../src/lib/shareCard'

/**
 * 카톡·페북 크롤러에게만 응답하는 조각 — 미리보기 카드를 HTML 에 박아 준다.
 *
 * ── 왜 서버 조각이 필요한가 ─────────────────────────────────────────
 *
 * 이 앱은 Vite SPA 다. `index.html` 하나에 메타 태그가 정적으로 박혀 있고
 * 화면은 전부 JS 가 그린다. **카카오톡·페이스북 크롤러는 JS 를 실행하지
 * 않으므로** 런타임에 메타를 바꾸는 방법(react-helmet 등)은 크롤러에게
 * 아무 효과가 없다. 서버가 응답할 때 이미 HTML 안에 들어 있어야 한다.
 *
 * ── 왜 Edge Middleware 가 아니라 Function 인가 ──────────────────────
 *
 * 미들웨어는 matcher 에 걸린 **모든** 요청을 거친다. 카드가 필요한 것은
 * 크롤러 한 번뿐인데, 사람이 게스트 링크를 열 때마다 미들웨어 콜드스타트를
 * 먼저 지나게 만들 이유가 없다. 대신 `vercel.json` 의 rewrite 가
 * `has: user-agent` 로 **크롤러일 때만** 이 함수로 보낸다 — 사람의 요청은
 * 이 파일에 닿지도 않고 예전처럼 정적 `index.html` 로 곧장 간다.
 * 첫 화면 지연이 0ms 늘어난다는 뜻이 아니라, 경로 자체가 안 바뀐다는 뜻이다.
 *
 * ── UA 목록에 무엇이 있고 무엇이 없는가 (vercel.json 은 주석을 못 단다) ──
 *
 * 있는 것: 메신저·SNS 의 **미리보기** 봇만 — kakaotalk-scrap ·
 * facebookexternalhit · Facebot · Twitterbot · Slackbot · Discordbot ·
 * TelegramBot · WhatsApp · SkypeUriPreview · LinkedInBot · redditbot ·
 * Embedly · Iframely · vkShare.
 *
 * 🚫 검색엔진(Googlebot · bingbot · Yeti · Daumoa)은 **일부러 뺐다.**
 *    넣으면 동아리 이름과 모임 이름이 검색 색인에 남는다 — 카톡방 안에서만
 *    도는 것과 검색되는 것은 전혀 다른 노출이다. 빼도 손해가 없다:
 *    검색엔진은 기본 카드(정적 index.html)를 그대로 받는다.
 *
 * 🚫 `KAKAOTALK` 은 **넣으면 안 된다.** 그건 카톡 인앱 브라우저를 쓰는
 *    사람의 UA 다(크롤러는 `kakaotalk-scrap`). 넣는 순간 카톡에서 링크를
 *    눌러 들어오는 사람 전원이 이 함수를 거치게 된다. 같은 이유로 LINE
 *    인앱 브라우저의 `Line/` 도 없다.
 *
 * 목록에 없는 크롤러는 그냥 기본 카드를 받는다 — 빠뜨려도 조용히 망가지지
 * 않는 구조라 목록을 넉넉히 잡을 이유가 없다.
 *
 * ── 사람에게 잘못 걸려도 앱은 그대로 돈다 ────────────────────────────
 *
 * UA 정규식이 사람을 크롤러로 오인할 수 있다. 그래서 이 함수는 카드용
 * 페이지를 새로 그리지 않고 **빌드된 `index.html` 을 그대로 가져와 카드
 * 블록만 갈아 끼운다.** 스크립트 태그도 `<div id="root">` 도 원본
 * 그대로라, 오인된 사람도 평소와 똑같은 앱을 본다.
 *
 * ── service_role 키는 여기 없다 ──────────────────────────────────────
 *
 * 쓰는 키는 앱 번들에 이미 들어 있는 publishable(anon) 키뿐이고, 부르는
 * 함수는 anon 에게만 열린 게스트 RPC 둘이다. 이 조각이 뚫려도 새로 열리는
 * 것이 없다 — 누구나 브라우저 콘솔에서 부를 수 있는 것과 같은 것만 부른다.
 */
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env['VITE_SUPABASE_URL'] ?? process.env['SUPABASE_URL'] ?? ''
const SUPABASE_KEY =
  process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_PUBLISHABLE_KEY'] ?? ''

/**
 * 서버(`guest_sessions` · `guest_board`)의 형식 검사와 **글자 그대로 같다**.
 * 여기서 먼저 거르는 이유는 보안이 아니라 비용이다 — 22자 base32 가 아니면
 * DB 를 부를 것도 없다. 크롤러 UA 는 누구나 흉내 낼 수 있으므로, 이 경로가
 * 곧 레이트리밋 없는 anon RPC 로 가는 길이라는 것을 잊으면 안 된다.
 */
const GUEST_CODE = /^[A-Z2-9]{22}$/
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 크롤러는 기다려 주지 않는다. DB 가 느릴 때 카드가 늦게 나오는 것보다
 * **기본 카드라도 제때 나오는 것**이 낫다 — 카톡은 응답이 늦으면 카드를
 * 아예 안 그린다.
 */
const RPC_TIMEOUT_MS = 1500
const SHELL_TIMEOUT_MS = 1500

/** 실패는 전부 null 이다. 호출부가 그때 기본 카드로 떨어진다 */
async function callGuestRpc(fn: string, args: Record<string, string>): Promise<unknown> {
  if (SUPABASE_URL === '' || SUPABASE_KEY === '') return null
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    // 네트워크 오류 · 타임아웃 · 깨진 JSON 전부 같은 결과다 — 기본 카드.
    // 여기서 던지면 크롤러가 500 을 받고 카드 대신 회색 URL 로 돌아간다.
    return null
  }
}

/** 빌드된 `index.html` 을 그대로 가져온다. 이 함수는 그 문서를 고치지 않고 카드 블록만 바꾼다 */
async function loadShell(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/index.html`, {
      signal: AbortSignal.timeout(SHELL_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * 껍데기를 못 가져왔을 때의 마지막 수단.
 *
 * 크롤러 전용 경로라 사람이 여기까지 오는 경우는 「UA 오인 + index.html
 * 조회 실패」 가 겹칠 때뿐이다. 그래도 링크가 죽지는 않도록 원래 주소로
 * 보내는 안내를 남긴다. 스크립트는 넣지 않는다 — CSP 가 `script-src 'self'`
 * 라 인라인 스크립트는 어차피 실행되지 않는다.
 */
function fallbackDocument(meta: string): string {
  return [
    '<!doctype html>',
    '<html lang="ko" data-theme="dark">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    meta,
    '  </head>',
    '  <body><p>페이지를 새로고침해 주세요.</p></body>',
    '</html>',
  ].join('\n')
}

async function buildCard(url: URL): Promise<ShareCard> {
  const kind = url.searchParams.get('kind')
  const code = url.searchParams.get('code') ?? ''
  if (!GUEST_CODE.test(code)) return DEFAULT_CARD

  if (kind === 'guest') {
    return buildGuestJoinCard(await callGuestRpc('guest_sessions', { p_code: code }))
  }

  if (kind === 'board') {
    const sessionId = url.searchParams.get('sessionId') ?? ''
    if (!SESSION_ID.test(sessionId)) return DEFAULT_CARD
    return buildGuestBoardCard(
      await callGuestRpc('guest_board', { p_code: code, p_session_id: sessionId }),
    )
  }

  return DEFAULT_CARD
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  /*
   * 배포 도메인이 여럿이다(운영 도메인 · vercel.app · 프리뷰). og:image 는
   * 절대 주소여야 하는데 한 도메인을 박아 두면 프리뷰에서 이미지가 안 뜬다 —
   * 요청이 실제로 들어온 호스트를 그대로 쓴다.
   */
  const host = request.headers.get('x-forwarded-host') ?? url.host
  /*
   * 프로토콜도 헤더에서 읽는다. Vercel 은 항상 `https` 를 넣어 주지만,
   * 고정해 버리면 이 함수를 로컬에서 실제로 돌려 볼 방법이 없어진다 —
   * 껍데기(`/index.html`)를 가져오는 fetch 가 로컬에서 전부 실패한다.
   * 배포에서는 값이 늘 `https` 라 동작이 바뀌지 않는다.
   */
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`

  const [card, shell] = await Promise.all([buildCard(url), loadShell(origin)])
  const meta = renderCardMeta(card, `${origin}/og.png`)
  const html = shell === null ? fallbackDocument(meta) : injectCardMeta(shell, meta)

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /*
       * 같은 주소가 사람에게는 정적 `index.html`, 크롤러에게는 이 응답이다.
       * 공유 캐시에 한 번 얹히면 둘이 섞일 수 있어서 **아예 저장하지
       * 않는다.** 이 경로를 타는 것은 링크를 붙여넣을 때의 크롤러 한 번뿐이라
       * 캐시로 아낄 것도 거의 없다(카톡은 자기 쪽에서 카드를 캐시한다).
       */
      'cache-control': 'private, no-store',
      vary: 'user-agent',
      /*
       * 게스트 링크는 코드가 곧 열쇠다. 검색엔진 UA 는 rewrite 대상이 아니라
       * 여기까지 오지도 않지만, 어떤 경로로든 색인에 들어가지 않도록 못 박는다.
       */
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
