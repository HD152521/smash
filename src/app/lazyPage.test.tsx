import { Component, Suspense, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RELOAD_FLAG, lazyPage } from './lazyPage'

/**
 * 청크 로딩 실패 회복.
 *
 * 배포가 새로 올라가면 열어둔 탭은 사라진 파일을 부른다.
 * 그냥 두면 흰 화면이고, 무작정 새로고침하면 무한 반복이다.
 * 그 사이를 지키는 규칙이라 조용히 썩기 쉽다.
 *
 * 규칙을 여기서 다시 적으면 lazyPage 가 망가져도 통과한다.
 * 그래서 진짜 lazyPage 를 렌더해서 확인한다.
 */
const reload = vi.fn()

beforeEach(() => {
  sessionStorage.clear()
  reload.mockClear()
  // jsdom 의 location.reload 는 그냥 스파이를 걸 수 없다
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Suspense 아래에서 터지는 오류를 잡아 화면에 표시한다 */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? <p>실패</p> : this.props.children
  }
}

async function renderPage(load: () => Promise<{ default: () => null }>) {
  const Page = lazyPage(load)
  render(
    <Boundary>
      <Suspense fallback={<p>불러오는 중</p>}>
        <Page />
      </Suspense>
    </Boundary>,
  )
  await screen.findByText(/실패|불러왔다/)
}

describe('청크 로딩 실패 회복', () => {
  const ok = () => Promise.resolve({ default: () => null })
  const boom = () => Promise.reject(new Error('MIME text/html'))

  it('실패하면 한 번 새로고침한다', async () => {
    await renderPage(boom)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBe('1')
  })

  it('두 번째 실패에서는 새로고침하지 않는다', async () => {
    // 파일이 진짜로 깨졌을 때 무한 새로고침에 빠지면
    // 원인을 볼 기회조차 사라진다
    await renderPage(boom)
    await renderPage(boom)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('오류를 삼키지 않는다', async () => {
    // 삼키면 Suspense 가 영영 안 풀려서 흰 화면이 그대로 남는다
    await renderPage(boom)
    expect(screen.getByText('실패')).toBeInTheDocument()
  })

  it('성공하면 표시를 지워 다음 배포 때 또 회복할 수 있게 한다', async () => {
    await renderPage(boom)
    expect(sessionStorage.getItem(RELOAD_FLAG)).toBe('1')

    const Page = lazyPage(ok)
    render(
      <Boundary>
        <Suspense fallback={<p>불러오는 중</p>}>
          <Page />
        </Suspense>
      </Boundary>,
    )
    await vi.waitFor(() => expect(sessionStorage.getItem(RELOAD_FLAG)).toBeNull())

    await renderPage(boom)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('sessionStorage 가 막혀 있으면 새로고침하지 않는다', async () => {
    // 사파리 비공개 모드 등. 표시를 남길 수 없으니 몇 번이든 반복하게 된다.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await renderPage(boom)
    expect(reload).not.toHaveBeenCalled()
  })
})
