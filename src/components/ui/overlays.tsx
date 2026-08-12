import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button, IconButton } from './primitives'
import { t } from '@/i18n'

/* ==========================================================================
   Shared overlay behaviour: Escape to dismiss, focus trap, scroll lock
   ========================================================================== */

function useOverlayBehaviour(open: boolean, onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const container = containerRef.current
      if (!container) return
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    // Move focus into the overlay on the next frame so the animation has begun.
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current
      const target = container?.querySelector<HTMLElement>('[data-autofocus], button, a[href], input')
      target?.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  return containerRef
}

/* ==========================================================================
   Drawer - the primary drilldown surface
   ========================================================================== */

export type DrawerWidth = 'sm' | 'md' | 'lg' | 'xl'

const DRAWER_WIDTHS: Record<DrawerWidth, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  /** Badges rendered under the title - severity, classification, confidence. */
  meta?: ReactNode
  width?: DrawerWidth
  children: ReactNode
  footer?: ReactNode
  /** Optional tab strip rendered directly beneath the header. */
  tabs?: ReactNode
}

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  meta,
  width = 'md',
  children,
  footer,
  tabs,
}: DrawerProps): React.JSX.Element | null {
  const containerRef = useOverlayBehaviour(open, onClose)
  const titleId = useId()

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="animate-in-fade absolute inset-0 bg-ink-900/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-in-drawer relative flex h-full w-full flex-col bg-surface shadow-drawer',
          DRAWER_WIDTHS[width],
        )}
      >
        <header className="flex items-start gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            {eyebrow ? <div className="label-institutional mb-1">{eyebrow}</div> : null}
            <h2 id={titleId} className="text-[0.9375rem] leading-5 font-semibold text-ink-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[0.8125rem] leading-[1.45] text-ink-500">{description}</p>
            ) : null}
            {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
          </div>
          <IconButton label={t('Close panel')} onClick={onClose} data-autofocus>
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        {tabs ? <div className="shrink-0 border-b border-ink-100 px-5">{tabs}</div> : null}

        <div className="scrollbar-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/* ==========================================================================
   Modal - reserved for confirmations and short forms
   ========================================================================== */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'sm',
}: ModalProps): React.JSX.Element | null {
  const containerRef = useOverlayBehaviour(open, onClose)
  const titleId = useId()

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="animate-in-fade absolute inset-0 bg-ink-900/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'animate-in-scale relative my-auto w-full rounded-xl border border-ink-100 bg-surface shadow-overlay',
          widths[width],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-500">{description}</p> : null}
          </div>
          <IconButton label={t('Close')} onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-surface-sunken px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Confirmation dialog for consequential actions. Where the workflow declares
 * `requiresReason`, the reason field is mandatory and is written to the audit
 * trail alongside the transition.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  intent = 'primary',
  requireReason,
  reasonLabel = 'Reason (recorded in the audit trail)',
  extra,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  intent?: 'primary' | 'critical' | 'positive'
  requireReason?: boolean
  reasonLabel?: string
  extra?: ReactNode
}): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const reasonId = useId()

  useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
    }
  }, [open])

  const invalid = Boolean(requireReason) && reason.trim().length < 8

  const handleConfirm = useCallback(() => {
    setTouched(true)
    if (invalid) return
    onConfirm(reason.trim())
    onClose()
  }, [invalid, onClose, onConfirm, reason])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant={intent} onClick={handleConfirm} disabled={invalid && touched}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {extra}
      {requireReason ? (
        <div className={cn(extra ? 'mt-4' : '')}>
          <label htmlFor={reasonId} className="mb-1 block text-xs font-medium text-ink-600">
            {reasonLabel}
            <span className="ml-0.5 text-crit-600">*</span>
          </label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('State the institutional basis for this action.')}
            className={cn(
              'w-full rounded-md border bg-surface px-2.5 py-1.5 text-[0.8125rem] leading-relaxed text-ink-800',
              'placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-govt-500/20',
              invalid && touched ? 'border-crit-300 focus:border-crit-500' : 'border-ink-200 focus:border-govt-400',
            )}
          />
          {invalid && touched ? (
            <p className="mt-1 text-[0.6875rem] text-crit-600">
              {t('A reason of at least eight characters is required. It is written to the permanent audit record.')}
            </p>
          ) : (
            <p className="mt-1 text-[0.6875rem] text-ink-400">
              {t('This reason is recorded permanently against your name in the audit trail.')}
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  )
}

/* ==========================================================================
   Tabs
   ========================================================================== */

export interface TabItem {
  id: string
  label: ReactNode
  count?: number
  icon?: ReactNode
  disabled?: boolean
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = 'underline',
  ariaLabel,
}: {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
  variant?: 'underline' | 'pill'
  ariaLabel?: string
}): React.JSX.Element {
  const handleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const dir = event.key === 'ArrowRight' ? 1 : -1
    for (let step = 1; step <= items.length; step += 1) {
      const next = items[(index + dir * step + items.length * step) % items.length]
      if (next && !next.disabled) {
        onChange(next.id)
        return
      }
    }
  }

  if (variant === 'pill') {
    return (
      <div role="tablist" aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-1', className)}>
        {items.map((item, i) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              className={cn(
                'interactive-surface inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
                active ? 'bg-govt-700 text-white shadow-xs' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                item.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              {item.icon}
              {item.label}
              {typeof item.count === 'number' ? (
                <span className={cn('numeric text-[0.625rem]', active ? 'text-white/70' : 'text-ink-400')}>
                  {item.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('scrollbar-slim -mb-px flex items-center gap-4 overflow-x-auto', className)}
    >
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            data-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            /* `selection-marker` draws the active underline as a bar that grows
               from the centre, so moving between tabs reads as one indicator
               travelling rather than two blinking. The border stays transparent
               and carries only the hover hint. */
            className={cn(
              'selection-marker interactive-surface relative inline-flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-[0.8125rem] font-medium whitespace-nowrap',
              active
                ? 'border-transparent text-govt-700'
                : 'border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800',
              item.disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'numeric rounded px-1 py-px text-[0.625rem]',
                  active ? 'bg-govt-50 text-govt-700' : 'bg-ink-100 text-ink-500',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* ==========================================================================
   Tooltip - lightweight, hover/focus, no external dependency
   ========================================================================== */

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const id = useId()

  const position: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined} className="inline-flex">
        {children}
      </span>
      {visible ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'animate-in-fade pointer-events-none absolute z-50 w-max max-w-xs rounded-md bg-ink-900 px-2.5 py-1.5',
            'text-[0.6875rem] leading-relaxed font-normal text-white shadow-overlay',
            position[side],
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}

/** Small "i" affordance that reveals an explanation on hover or focus. */
export function InfoHint({ children, className }: { children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <Tooltip content={children} className={className}>
      <button
        type="button"
        aria-label={t('Explanation')}
        className="info-hint flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-300 text-[0.5625rem] font-semibold text-ink-400 transition-colors hover:border-govt-400 hover:text-govt-600"
      >
        i
      </button>
    </Tooltip>
  )
}
