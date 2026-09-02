import { describe, expect, test } from 'vitest'
import { appTabFor } from '@/components/nav/appTabs'

/**
 * **갇히는 사람이 없어야 한다.**
 *
 * 2026-09-01 에 히스토리 되짚기(`navigate(-1)`)를 걷어내고, 하단탭이 덮는
 * 화면에서는 위쪽 이동을 지웠다. 이 정리의 유일한 진짜 위험은 하나다 —
 * **탭바도 없고 나가는 링크도 없는 화면이 하나라도 생기면 사람이 갇힌다.**
 * 폰에는 브라우저 뒤로가기가 있지만, 아이폰 홈 화면에 추가해 쓰는 사람
 * (알림 때문에 우리가 그렇게 안내한다)에게는 그것도 없다.
 *
 * ## 왜 화면을 띄우지 않고 소스를 읽나
 *
 * 라우트 대부분이 코드 스플리팅이고(`lazyPage`), 화면마다 로딩·권한·리다
 * 이렉트 분기가 달라서 "렌더해서 링크를 찾는" 검사는 **찾지 못했을 때
 * 그것이 없어서인지 아직 안 왔기 때문인지 구별할 수 없다.** 그런 검사는
 * 조용히 통과하거나 조용히 깨진다.
 *
 * 그래서 라우트 표(`routes.tsx`)를 읽어 **모든 경로를 전수로** 뽑고, 각
 * 경로가 어느 화면 파일에 붙는지 따라가 그 파일(과 그 파일이 쓰는 껍데기
 * 컴포넌트)에 출구가 있는지를 본다. 새 라우트를 추가하면 아무것도 안 해도
 * 이 검사에 걸린다 — 그게 이 방식을 고른 이유다.
 */

/*
 * 소스는 `node:fs` 가 아니라 번들러가 읽어 온다. 앱 쪽 tsconfig 에는 node
 * 타입이 없고(브라우저 코드에 node API 가 새는 것을 막는다), 이 한 검사를
 * 위해 그 문을 열 이유가 없다. `?raw` 는 파일 내용을 문자열로 준다.
 */
const ALL: Record<string, string> = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** 검사 대상은 앱 코드다 — 테스트 파일끼리 서로를 잡지 않게 뺀다 */
const SOURCES = Object.keys(ALL).filter((f) => !/\.test\.tsx?$/.test(f))

/** 주소의 `:param` 을 아무 값으로 채운다 — 탭 규칙은 값이 아니라 모양을 본다 */
function concrete(path: string): string {
  return path.replace(/:[A-Za-z]+/g, 'x')
}

function read(file: string): string {
  const src = ALL[file]
  if (src === undefined) throw new Error(`읽을 수 없는 파일: ${file}`)
  return src
}

/** `@/…` 를 실제 파일 키로 — 확장자는 붙어 있지 않다 */
function resolveAlias(spec: string): string | null {
  if (!spec.startsWith('@/')) return null
  const base = `/src/${spec.slice(2)}`
  for (const ext of ['.tsx', '.ts']) {
    if (ALL[base + ext] !== undefined) return base + ext
  }
  return null
}

const EXIT_MARK = /<(BackBar|BackLink)\b/

/**
 * 이 화면에 **위쪽 이동**(나가는 링크)이 있나.
 *
 * 페이지가 직접 그리기도 하고(`<BackBar/>`), 공통 껍데기가 대신 그리기도
 * 한다(`AdminScreen` · `MatchEditorScreen` · `TournamentNav`). 그래서 그
 * 파일이 쓰는 `@/…` 파일까지 한 겹 더 따라간다. 두 겹이면 충분하다 —
 * 껍데기의 껍데기는 이 저장소에 없다.
 */
function hasUpLink(file: string, depth = 2, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false
  seen.add(file)
  const src = read(file)
  if (EXIT_MARK.test(src)) return true
  if (depth <= 0) return false
  for (const m of src.matchAll(/from '(@\/[^']+)'/g)) {
    const next = resolveAlias(m[1]!)
    if (next && !next.endsWith('.test.tsx') && hasUpLink(next, depth - 1, seen)) return true
  }
  return false
}

/** 라우트 표에서 `path` 와 그 자리에 서는 화면 컴포넌트를 뽑는다 */
function routeTable(): { path: string; component: string }[] {
  const src = read('/src/app/routes.tsx')
  const out: { path: string; component: string }[] = []
  for (const m of src.matchAll(
    /path="([^"]+)"[\s\S]{0,400}?element=\{([\s\S]{0,400}?)\}\s*\/?>/g,
  )) {
    const path = m[1]!
    if (path === '*') continue
    // element 안의 컴포넌트들 중 가드(Protected · Public · RequireAuth 등)가
    // 아닌 첫 번째가 그 화면이다
    const names = [...m[2]!.matchAll(/<([A-Z][A-Za-z]*)/g)].map((x) => x[1]!)
    const screen = names.find((n) => !GUARDS.has(n))
    if (screen) out.push({ path, component: screen })
  }
  return out
}

const GUARDS = new Set(['Protected', 'Public', 'RequireAuth', 'Suspense', 'TournamentOnly'])

/** 컴포넌트 이름 → 그 화면의 소스 파일 (`lazyPage` 든 직접 import 든) */
function componentFiles(): Map<string, string> {
  const src = read('/src/app/routes.tsx')
  const map = new Map<string, string>()
  for (const m of src.matchAll(/const (\w+) = lazyPage\(\(\) =>\s*import\('(@\/[^']+)'\)/g)) {
    const file = resolveAlias(m[2]!)
    if (file) map.set(m[1]!, file)
  }
  for (const m of src.matchAll(/import \{ (\w+) \} from '(@\/[^']+)'/g)) {
    const file = resolveAlias(m[2]!)
    if (file) map.set(m[1]!, file)
  }
  return map
}

/**
 * 출구가 없어도 되는 화면 — **각자 이유가 있어야 한다.**
 *
 * 게스트 둘은 특별하다. 계정이 없는 사람에게 `/` 는 메인이 아니라 로그인
 * 화면이라, 이 앱의 어느 장소로 보내도 막다른 길이다
 * (`guestScreensHaveNoHome.test.tsx`). 그리고 이 둘은 **그 사람에게
 * 목적지 자체**다 — 등록 화면에서 현황판으로 들어가고, 현황판은 코트를
 * 보러 온 곳이라 나갈 위가 없다. 되돌아가도 등록 화면이 다시 현황판으로
 * 보낸다(`GuestJoinPage` 의 `returning`). 갈 길이 막힌 때
 * (링크 만료 · 모임 종료)에만 등록 화면으로 돌아가는 줄이 뜬다.
 */
const NO_EXIT_NEEDED: Record<string, string> = {
  '/login': '로그인 화면. 아직 사람이 없고, 여기가 로그아웃 상태의 첫 화면이다',
  '/auth/callback': '로그인 처리 중 스쳐 가는 화면. 끝나면 스스로 옮겨 간다',
  '/g/:guestCode': '게스트의 첫 화면. 계정이 없어 이 앱의 어느 장소도 출구가 아니다',
  '/g/:guestCode/:sessionId': '게스트 현황판. 그 사람이 코트를 보러 온 목적지 자체다',
}

/**
 * 하단탭이 있는데도 위쪽 이동을 남기는 화면 — **예외는 근거와 함께.**
 */
const TABBED_BUT_KEEPS_LINK: Record<string, string> = {
  /*
   * 비어 있는 것이 맞다. 한때 `/c/:clubId` 가 여기 있었다 — 동아리가
   * 하나뿐이면 '동아리' 탭이 그 동아리로 바로 가서, 이 화면에서 탭이
   * 자기 자신을 가리켰기 때문이다. 지금은 탭이 **언제나 목록으로** 가므로
   * 탭이 곧 출구다(`AppTabBar`).
   *
   * 새로 더할 때는 근거를 함께 적어라. 근거 없이 늘어나면 이 목록이
   * "규칙" 이 아니라 "예외 모음" 이 된다.
   */
}

const ROUTES = routeTable()
const FILES = componentFiles()

describe('라우트 표를 읽어 낸다', () => {
  test('경로마다 화면 파일을 찾을 수 있다', () => {
    expect(ROUTES.length).toBeGreaterThan(30)
    for (const { path, component } of ROUTES) {
      expect(FILES.get(component), `${path} 의 ${component}`).toBeTruthy()
    }
  })
})

describe('나가는 길이 하나도 없는 화면은 없다', () => {
  test.each(ROUTES.map((r) => [r.path, r.component] as const))('%s', (path, component) => {
    if (NO_EXIT_NEEDED[path]) return

    const tabbed = appTabFor(concrete(path)) !== null
    const link = hasUpLink(FILES.get(component)!)

    // 탭바(전역 하단탭)가 뜨거나, 목적지가 적힌 링크가 있거나. 둘 다 없으면 갇힌다.
    expect(tabbed || link, `${path} — 탭바도 없고 나가는 링크도 없다`).toBe(true)
  })
})

describe('탭바가 덮는 화면에는 위쪽 이동이 없다 — 출구가 둘이면 둘 다 덜 믿는다', () => {
  const tabbed = ROUTES.filter((r) => appTabFor(concrete(r.path)) !== null)

  test('탭바가 뜨는 화면을 실제로 잡고 있다', () => {
    // 이 묶음이 조용히 빈 채로 통과하지 않게 한다
    expect(tabbed.length).toBeGreaterThan(5)
  })

  test.each(tabbed.map((r) => [r.path, r.component] as const))('%s', (path, component) => {
    if (TABBED_BUT_KEEPS_LINK[path]) return
    expect(hasUpLink(FILES.get(component)!), `${path} — 탭으로 나갈 수 있는데 위에 또 있다`).toBe(
      false,
    )
  })
})

/**
 * 대회·모임 화면은 `TournamentTabBar` 가 깔리지만 그 탭은 **전부 대회
 * 안**이다(코트·대진표·참가자·기록·더보기). 대회 밖으로 나가는 길은
 * 머리말 하나뿐이라 여기만은 위쪽 이동이 남아야 한다.
 */
describe('대회 안에서도 대회 밖으로 나갈 수 있다', () => {
  const inTournament = ROUTES.filter((r) => r.path.startsWith('/t/'))

  test.each(inTournament.map((r) => [r.path, r.component] as const))('%s', (path, component) => {
    expect(appTabFor(concrete(path)), `${path} 는 전역탭 자리가 아니다`).toBeNull()
    expect(hasUpLink(FILES.get(component)!), `${path} — 대회에 갇힌다`).toBe(true)
  })
})

/**
 * **글자와 실제로 가는 곳이 같아야 한다.**
 *
 * '뒤로' 는 되짚기 시절의 말이다 — 어디로 가는지 모르니 그렇게밖에 쓸 수
 * 없었다. 지금은 목적지가 못 박혀 있으므로 그 이름을 적는다. '돌아가기' ·
 * '나가기' 도 같은 이유로 안 쓴다: 눌러 봐야만 어디에 떨어지는지 안다.
 */
const VAGUE = ['뒤로', '돌아가기', '나가기', '이전', '취소']

/** 주석을 걷어낸 코드만 — 주석에 적힌 말까지 잡으면 근거를 못 남긴다 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('나가는 길은 목적지를 글자로 말한다', () => {
  test.each(VAGUE)('어느 화면에도 %s 라고 적힌 출구가 없다', (word) => {
    const bad: string[] = []
    for (const file of SOURCES) {
      const src = read(file)
      for (const m of src.matchAll(/<BackBar[^>]*?\blabel="([^"]*)"/gs)) {
        if (m[1] === word) bad.push(`${file} (BackBar label)`)
      }
      for (const m of src.matchAll(/\bbackLabel="([^"]*)"/g)) {
        if (m[1] === word) bad.push(`${file} (backLabel)`)
      }
      for (const m of src.matchAll(/<BackLink[^>]*>\s*([^<{\s][^<{]*?)\s*<\/BackLink>/gs)) {
        if (m[1] === word) bad.push(`${file} (BackLink)`)
      }
    }
    expect(bad).toEqual([])
  })

  /*
   * 되짚기가 되살아나는 것을 여기서 막는다. `navigate(-1)` 하나만 있으면
   * 그 화면의 출구는 다시 "어디로 갈지 모르는 버튼" 이 된다.
   */
  test('히스토리를 되짚는 코드가 남아 있지 않다', () => {
    // 주석은 뺀다 — 왜 걷어냈는지 설명하려면 그 말을 적어야 한다(`BackLink`)
    const bad = SOURCES.filter((f) => /navigate\(\s*-\d/.test(codeOnly(read(f))))
    expect(bad).toEqual([])
  })
})
