import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from './icons'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Rendered in a sticky footer, typically the cancel/save buttons. */
  footer?: ReactNode
  /**
   * 'sheet' fills the phone screen — right for long forms.
   * 'compact' stays a small centred card at every width — right for confirmations,
   * where a full-screen takeover for two lines of text is jarring.
   */
  size?: 'sheet' | 'compact'
}

const SIZES = {
  sheet:
    'm-0 h-dvh max-h-dvh w-dvw max-w-none sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[min(42rem,calc(100vw-2rem))]',
  compact: 'm-auto h-auto max-h-[90dvh] w-[min(26rem,calc(100vw-2rem))]',
} as const

const CARDS = {
  sheet: 'h-full sm:rounded-2xl sm:shadow-[var(--shadow-pop)]',
  // No `h-full`: the card must shrink to its content rather than stretch to the
  // dialog's max height.
  compact: 'max-h-[90dvh] rounded-2xl shadow-[var(--shadow-pop)]',
} as const

/**
 * Built on the native `<dialog>` element so focus trapping, the top layer and
 * Escape-to-close come from the browser rather than hand-rolled listeners.
 * Full-height sheet on phones, centred card from `sm` up.
 */
export function Modal({ open, title, onClose, children, footer, size = 'sheet' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Let React own the open state instead of the browser closing behind its back.
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // The dialog element itself is the backdrop area; the inner div is the card.
        if (event.target === ref.current) onClose()
      }}
      className={`bg-transparent p-0 backdrop:bg-black/45 backdrop:backdrop-blur-sm ${SIZES[size]}`}
    >
      <div className={`flex flex-col overflow-hidden bg-surface text-ink ${CARDS[size]}`}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="icon-btn"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}
