import { useState, type ReactNode } from 'react'
import { AlertOctagon, ShieldCheck } from 'lucide-react'
import { HUMAN_CONFIRMATION_REQUIRED } from '@/security/model'
import { getRole } from '@/security/roles'
import { useCurrentUser } from '@/stores/auth.store'
import { formatDateTime } from '@/utils/format'
import { DEMO_NOW } from '@/utils/deterministic'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badges'
import { Button, Card, Checkbox } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/overlays'
import { t } from '@/i18n'

/**
 * Human confirmation gate.
 *
 * The technical enforcement of the platform's central governance principle:
 * high-impact determinations are reserved to human authority. Where an act
 * falls into a reserved class, this gate requires the acting officer to
 * acknowledge, by name, that they are taking the decision - the platform is
 * not taking it for them, and no AI output can substitute for this step.
 *
 * This is deliberately more friction than a plain confirmation dialog. That
 * friction is the control.
 */

export interface HumanConfirmationGateProps {
  open: boolean
  onClose: () => void
  onConfirm: (record: HumanConfirmationRecord) => void
  /** The reserved act being performed, from HUMAN_CONFIRMATION_REQUIRED. */
  reservedActId?: string
  title: string
  description: ReactNode
  /** What will actually happen once confirmed. */
  consequence: string
  /** Where the recommendation originated, if any. */
  advisorySource?: {
    kind: 'ai-recommendation' | 'rule-engine' | 'analyst' | 'model'
    label: string
    confidence?: string
  }
  confirmLabel?: string
  intent?: 'primary' | 'critical' | 'positive'
}

export interface HumanConfirmationRecord {
  confirmedBy: string
  confirmedByRole: string
  confirmedAt: string
  rationale: string
  acknowledgedAuthority: true
  reservedActId?: string
}

export function HumanConfirmationGate({
  open,
  onClose,
  onConfirm,
  reservedActId,
  title,
  description,
  consequence,
  advisorySource,
  confirmLabel = 'Confirm as the deciding officer',
  intent = 'primary',
}: HumanConfirmationGateProps): React.JSX.Element {
  const user = useCurrentUser()
  const role = user ? getRole(user.roleId) : null
  const [rationale, setRationale] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [touched, setTouched] = useState(false)

  const reservedAct = reservedActId
    ? HUMAN_CONFIRMATION_REQUIRED.find((a) => a.id === reservedActId)
    : undefined

  const rationaleValid = rationale.trim().length >= 12
  const canConfirm = rationaleValid && acknowledged

  const handleConfirm = (): void => {
    setTouched(true)
    if (!canConfirm || !user) return
    onConfirm({
      confirmedBy: user.name,
      confirmedByRole: role?.name ?? user.designation,
      confirmedAt: DEMO_NOW.toISOString(),
      rationale: rationale.trim(),
      acknowledgedAuthority: true,
      reservedActId,
    })
    setRationale('')
    setAcknowledged(false)
    setTouched(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant={intent} onClick={handleConfirm} disabled={touched && !canConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {reservedAct ? (
          <Card tone="critical" className="flex items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-crit-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-crit-700">
                {t('Reserved act - {0}', reservedAct.label)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">{reservedAct.rationale}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                {t('The platform cannot perform this act, cannot recommend it as completed, and no AI output may substitute for your determination.')}
              </p>
            </div>
          </Card>
        ) : null}

        <Card tone="sunken">
          <p className="label-institutional mb-1">{t('What will happen')}</p>
          <p className="text-[0.8125rem] leading-relaxed text-ink-700">{consequence}</p>
        </Card>

        {advisorySource ? (
          <Card tone="info">
            <p className="label-institutional mb-1">{t('Advisory input')}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={advisorySource.kind === 'ai-recommendation' ? 'intel' : 'neutral'}>
                {advisorySource.label}
              </Badge>
              {advisorySource.confidence ? <Badge tone="muted">{advisorySource.confidence}</Badge> : null}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
              {t('This input is advisory. It informs your decision; it does not make it, and it carries no institutional authority of its own.')}
            </p>
          </Card>
        ) : null}

        <div>
          <label htmlFor="hcg-rationale" className="mb-1 block text-xs font-medium text-ink-600">
            {t('Your rationale')}<span className="ml-0.5 text-crit-600">*</span>
            <span className="ml-1.5 font-normal text-ink-400">{t('recorded permanently against your name')}</span>
          </label>
          <textarea
            id="hcg-rationale"
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('State the institutional basis on which you are taking this decision.')}
            className={cn(
              'w-full rounded-md border bg-surface px-2.5 py-1.5 text-[0.8125rem] leading-relaxed text-ink-800',
              'placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-govt-500/20',
              touched && !rationaleValid ? 'border-crit-300 focus:border-crit-500' : 'border-ink-200 focus:border-govt-400',
            )}
          />
          {touched && !rationaleValid ? (
            <p className="mt-1 text-[0.6875rem] text-crit-600">
              {t('A rationale of at least twelve characters is required.')}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-ink-200 bg-surface-sunken px-3 py-2.5">
          <Checkbox
            checked={acknowledged}
            onChange={setAcknowledged}
            label={
              <span className="text-xs leading-relaxed text-ink-700">
                {t('I am taking this decision in my institutional capacity as')}{' '}
                <span className="font-semibold">{role?.name ?? user?.designation ?? 'the acting officer'}</span>{t(', and I accept accountability for it.')}
              </span>
            }
          />
          {touched && !acknowledged ? (
            <p className="mt-1.5 pl-5 text-[0.6875rem] text-crit-600">
              {t('This acknowledgement is required. The decision cannot proceed without it.')}
            </p>
          ) : null}
        </div>

        <div className="flex items-start gap-2 border-t border-ink-100 pt-3 text-[0.6875rem] leading-relaxed text-ink-400">
          <ShieldCheck className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <p>
            {t('This confirmation will be written to the audit trail as')}{' '}
            <span className="font-medium text-ink-600">{user?.name ?? 'the acting officer'}</span> ·{' '}
            {role?.name ?? '-'} · {formatDateTime(DEMO_NOW.toISOString())}{t(', together with your rationale. It cannot be amended or removed afterwards.')}
          </p>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Inline notice stating that an action is reserved to human authority.
 * Rendered beside AI recommendations and automated workflow steps.
 */
export function ReservedActNotice({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-md border border-ink-200 bg-surface-sunken px-3 py-2.5 text-[0.6875rem] leading-relaxed text-ink-500',
        className,
      )}
    >
      <p className="mb-1.5 font-semibold text-ink-700">{t('Reserved to human authority')}</p>
      <p className="mb-2">
        {t('The platform can analyse, recommend, forecast, summarise, detect anomalies, prioritise, simulate and explain. It cannot decide. The following acts are technically prevented, not merely discouraged by policy:')}
      </p>
      <ul className="space-y-1">
        {HUMAN_CONFIRMATION_REQUIRED.map((act) => (
          <li key={act.id} className="flex items-start gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-300" aria-hidden />
            <span>
              <span className="font-medium text-ink-600">{act.label}</span> - {act.rationale}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
