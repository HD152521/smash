import { lazy, type ComponentType } from 'react'

/**
 * 배포 직후 열어둔 탭을 살려낸다.
 *
 * 새 배포가 올라가면 청크 파일 이름이 바뀐다(index-A1B2.js → index-C3D4.js).
 * 이미 열려 있던 탭은 사라진 이름을 부르고, 서버는 SPA 라우팅 때문에
 * index.html 을 돌려준다. 브라우저는 JS 자리에서 HTML 을 받았으니 거부한다:
 *   "Expected a JavaScript-or-Wasm module script but the server responded
 *    with a MIME type of text/html"
 *
 * 사용자 눈에는 그냥 흰 화면이다. 체육관에서 점수를 넣던 심판이 이걸 만나면
 * 방법이 없다. 그래서 한 번 새로고침해서 새 파일 목록을 받아온다.
 *
 * 한 번만 한다 — 진짜로 파일이 깨진 경우 무한 새로고침에 빠지면
 * 원인을 볼 기회조차 사라진다.
 *
 * 짝이 되는 설정이 vercel.json 에 있다:
 *   "source": "/((?!assets/).*)"
 * SPA 리라이트에서 assets 를 빼둔 것이다. 안 그러면 없는 청크 요청에도
 * index.html 이 돌아와 'JS 자리에 HTML' 이라는 엉뚱한 증상만 보인다.
 * vercel.json 은 주석을 못 달아(스키마 검증에서 걸린다) 여기 적어 둔다.
 */
export const RELOAD_FLAG = 'smash:chunk-reloaded'

/** sessionStorage 는 사파리 비공개 모드 등에서 막힐 수 있다 */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null
  } catch {
    // 읽지 못하면 '이미 새로고침했다' 고 본다.
    // 무한 새로고침이 흰 화면보다 나쁘기 때문이다.
    return true
  }
}

function writeFlag(): boolean {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    return true
  } catch {
    return false
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* 못 지워도 다음 배포 때 한 번 더 새로고침할 뿐이다 */
  }
}

export function lazyPage<T extends ComponentType<Record<string, never>>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await load()
      clearFlag()
      return mod
    } catch (err) {
      if (!readFlag() && writeFlag()) {
        window.location.reload()
      }
      // 새로고침이 시작돼도 이 프라미스는 거절해야 한다.
      // 삼키면 Suspense 가 영영 안 풀려서 흰 화면이 그대로 남는다.
      throw err
    }
  })
}
