import { describe, expect, test } from 'vitest'
import { appTabFor } from './appTabs'

/**
 * 전역 하단탭이 **어디에 뜨고 어디에 안 뜨는지.**
 *
 * 이건 화면이 아니라 **규칙**이다. 규칙이 조용히 넓어지면(누가 접두사
 * 하나를 더 잡으면) 폼 화면에 탭이 딸려 들어와 입력하던 것이 날아가고,
 * 조용히 좁아지면 탭을 누른 결과가 탭을 없애는 꼴이 된다. 둘 다 코드를
 * 읽어서는 안 보이고 여기서만 잡힌다.
 */
describe('탭이 뜨는 곳 — 장소', () => {
  test.each([
    ['/', 'home'],
    ['/clubs', 'clubs'],
    ['/my', 'list'],
    ['/me', 'me'],
    ['/settings/alerts', 'me'],
  ])('%s → %s', (path, tab) => {
    expect(appTabFor(path)).toBe(tab)
  })

  test.each(['/c/abc', '/c/abc/members', '/c/abc/guest', '/c/abc/invite', '/c/abc/settings'])(
    '%s 는 동아리 탭이다 — 하위 화면에서도 탭이 사라지지 않는다',
    (path) => {
      /*
       * 동아리 탭은 동아리가 하나뿐인 사람을 `/c/:id` 로 바로 보낸다.
       * 그 화면에서 탭이 사라지면 **탭을 누른 결과가 탭을 없애는** 꼴이다.
       */
      expect(appTabFor(path)).toBe('clubs')
    },
  )

  test('끝의 슬래시는 같은 화면이다', () => {
    expect(appTabFor('/my/')).toBe('list')
    expect(appTabFor('/')).toBe('home')
  })
})

describe('탭이 안 뜨는 곳', () => {
  test.each([
    '/t/11111111-1111-1111-1111-111111111111',
    '/t/11111111-1111-1111-1111-111111111111/schedule',
    '/t/11111111-1111-1111-1111-111111111111/members',
    '/t/11111111-1111-1111-1111-111111111111/matches/new-session',
  ])('%s — TournamentTabBar 의 자리다. 두 탭바가 동시에 뜨면 안 된다', (path) => {
    expect(appTabFor(path)).toBeNull()
  })

  test.each(['/g/ABCDEFGHJKMNPQRSTUVWX2', '/g/ABCDEFGHJKMNPQRSTUVWX2/sess-1'])(
    '%s — 게스트에게는 탭 넷이 전부 막다른 길이다',
    (path) => {
      /*
       * 계정이 없는 사람에게 `/` 는 메인이 아니라 로그인 화면이다.
       * `guestScreensHaveNoHome.test.tsx` 가 홈 버튼에 대해 지키는 것과
       * 같은 규칙 — 출구처럼 생긴 막다른 길을 만들지 않는다.
       */
      expect(appTabFor(path)).toBeNull()
    },
  )

  test.each(['/login', '/auth/callback'])('%s — 아직 사람이 없다', (path) => {
    expect(appTabFor(path)).toBeNull()
  })

  test.each(['/new', '/new/session', '/join', '/clubs/new', '/clubs/join'])(
    '%s — 작업 화면. 탭으로 새면 입력한 것이 사라진다',
    (path) => {
      expect(appTabFor(path)).toBeNull()
    },
  )

  test('모르는 주소에는 안 뜬다 — 허용 목록이지 차단 목록이 아니다', () => {
    // 새 화면을 만드는 사람이 규칙에 한 줄을 더하지 않으면 탭이 안 뜬다.
    // 폼 화면에 탭이 딸려 들어오는 쪽이 훨씬 나쁘므로 그게 맞는 기본값이다.
    expect(appTabFor('/whatever/new-screen')).toBeNull()
  })
})
