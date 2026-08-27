import '@testing-library/jest-dom/vitest'

/**
 * jsdom 은 `<dialog>` 의 `showModal`/`close` 를 구현하지 않는다
 * (레이아웃이 없는 환경이라 모달 스택을 흉내 낼 수 없다). `Modal`
 * 컴포넌트(components/ui/Modal.tsx)가 이 둘에 의존하므로, 열리고
 * 닫히는 것만 흉내 내는 최소 폴리필을 붙인다 — 실제 브라우저 동작
 * (포커스 트랩 등)은 검증하지 않고 "열림/닫힘 상태"만 맞춘다.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  }
}
