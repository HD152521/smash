import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useInAppNotifications } from './useInAppNotifications'

export function NotificationBanner() {
  const { banner, dismiss } = useInAppNotifications()
  if (!banner) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 mx-auto max-w-2xl px-3 pt-3"
      // 노치·상태바를 피한다
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-1 p-3 shadow-card">
        <Bell className="size-5 shrink-0 text-brand-fg" aria-hidden />
        <Link to={banner.url} onClick={dismiss} className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-1">{banner.title}</p>
          <p className="truncate text-sm text-ink-2">{banner.body}</p>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="닫기"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3
                     transition-colors hover:bg-surface-2 hover:text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
