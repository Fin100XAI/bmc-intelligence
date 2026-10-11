import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  FileCheck2,
  Network,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { municipality } from '@/config/municipality.config'
import { ROUTES } from '@/config/navigation'
import { DEMO_ACCESS_PASSPHRASE, DEMO_USERS, SIGN_IN_BAND_ORDER, USER_BY_ID } from '@/auth/demo-users'
import { getRole } from '@/security/roles'
import { resolvePreferredLanding } from '@/routes/RouteGuard'
import { authService } from '@/services/auth.service'
import { ServiceError } from '@/services/client'
import { isApiEnabled } from '@/services/http'
import { useAuthStore, useIsAuthenticated } from '@/stores/auth.store'
import { useActiveCorporation } from '@/stores/corporation.store'
import { cityName, corporationName } from '@/config/corporations'
import { coverPhotos, photoCredit, type CoverPhoto } from '@/config/coverPhotos'
import { useApplyLocale } from '@/stores/locale.store'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import { Badge, ClassificationBadge, EnvironmentBadge } from '@/components/ui/badges'
import { Button, Card, Input, Label } from '@/components/ui/primitives'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * First-run experience.
 *
 * A principal is selected by POSITION, not by the name of the officer holding
 * it - the position determines authority, data scope and permitted action.
 * Entry is gated by a shared demonstration passphrase.
 */

/** The three properties the institutional panel leads with — what the platform
 *  is, stated plainly. No environment, provenance or hierarchy detail here. */
function build$PANEL_PILLARS(): Array<{ icon: LucideIcon; title: string; detail: string }> {
  return [
  {
    icon: ShieldCheck,
    title: t('Governed by role'),
    detail: t('Every screen, figure and action is gated by the permission engine — enforced in the data layer, not by hiding links.'),
  },
  {
    icon: FileCheck2,
    title: t('Evidence-backed'),
    detail: t('Every metric traces to its source record and the computation that produced it. Nothing is asserted without provenance.'),
  },
  {
    icon: Network,
    title: t('Decision to outcome'),
    detail: t('City signals become intelligence, decisions, field actions and measured outcomes — one connected operating chain.'),
  },
]
}
let PANEL_PILLARS: Array<{ icon: LucideIcon; title: string; detail: string }> = build$PANEL_PILLARS()

/* Real photographs of Mumbai from Wikimedia Commons, cross-fading behind the
   institutional panel. Each is captioned for what it shows and credited in the
   corner while it is on screen; full records are in
   public/cover/PHOTO-CREDITS.txt (machine-readable: public/cover/photos.json). */
function build$PANEL_PHOTOS(): CoverPhoto[] {
  const photos = coverPhotos()
  return [photos.skylineNight, photos.seaLink, photos.csmt, photos.marineDrive, photos.flamingos]
}
let PANEL_PHOTOS: CoverPhoto[] = build$PANEL_PHOTOS()

registerLayer(() => {
  PANEL_PILLARS = build$PANEL_PILLARS()
  PANEL_PHOTOS = build$PANEL_PHOTOS()
})

/** Two-letter initials for the position badge, from the designation. */
function initialsOf(designation: string): string {
  const words = designation.split(/[\s-]+/).filter((word) => /^[A-Za-z]/.test(word))
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '•'
}

export function LoginPage(): React.JSX.Element {
  const isAuthenticated = useIsAuthenticated()
  const signIn = useAuthStore((s) => s.signIn)
  const corporation = useActiveCorporation()
  const navigate = useNavigate()
  // Sign-in sits outside the shell, so it applies the language itself.
  const locale = useApplyLocale()
  /**
   * The module the visitor asked for on the portal before they had a session.
   * Only ever an in-application path: anything absolute, protocol-relative or
   * otherwise pointing off this origin is discarded here rather than trusted
   * and re-checked later, so a crafted link cannot use the sign-in screen as an
   * open redirect.
   */
  const [searchParams] = useSearchParams()
  const rawNext = searchParams.get('next') ?? ''
  const nextRoute = /^\/(?!\/)/.test(rawNext) ? rawNext : ''

  const [selected, setSelected] = useState<string>('user-commissioner')
  const [passphrase, setPassphrase] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  /** True while the server session is being established, so the form cannot be
   *  submitted twice and the operator can see that something is happening. */
  const [signingIn, setSigningIn] = useState(false)

  /* The panel's slideshow. Held still for a reader who has asked the system
     for reduced motion. */
  const [photoIndex, setPhotoIndex] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setPhotoIndex((index) => (index + 1) % PANEL_PHOTOS.length), 6500)
    return () => window.clearInterval(timer)
  }, [])
  const activePhoto = PANEL_PHOTOS[photoIndex % PANEL_PHOTOS.length]

  /** Positions grouped by institutional band, most senior first. */
  const grouped = useMemo(() => {
    const bandLabel: Record<string, string> = {
      executive: 'Executive authority',
      senior: 'Senior officers',
      oversight: 'Oversight and assurance',
      operational: 'Operational officers',
    }
    return SIGN_IN_BAND_ORDER.map((band) => ({
      band,
      label: bandLabel[band] ?? band,
      users: DEMO_USERS.filter((u) => getRole(u.roleId)?.band === band),
    })).filter((group) => group.users.length > 0)
  }, [])

  /*
   * Already signed in: go to the portal, not straight into the console.
   *
   * The session is persisted, so an officer who returns to this screen with a
   * live session never reaches the submit handler below — and that handler is
   * the only path that opened the portal. Sending them to `/` instead meant
   * the corporation's own front page was unreachable for anyone who had signed
   * in once and not since signed out, which is everyone, most of the time.
   *
   * The portal is one click from the console, so this costs a returning
   * officer nothing and makes the institutional route the default arrival for
   * both a fresh sign-in and a return visit.
   */
  if (isAuthenticated) return <Navigate to={ROUTES.portal} replace />

  const selectedUser = USER_BY_ID.get(selected)
  const selectedRole = selectedUser ? getRole(selectedUser.roleId) : null

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setAttempted(true)

    if (passphrase.length === 0) {
      setError('Enter the demonstration passphrase to continue.')
      return
    }
    // Kept for the demonstration build, where there is no server to ask. When
    // an API is configured this check is only a courtesy that saves a round
    // trip: `establishServerSession` below compares the passphrase again on
    // the server, against a value that never ships to the browser, and that
    // comparison is the one that decides anything.
    if (!isApiEnabled() && passphrase !== DEMO_ACCESS_PASSPHRASE) {
      setError('That passphrase is not recognised. Check it and try again.')
      return
    }

    // Establish the server session BEFORE the local one. The cookie issued
    // here is what lets this officer read their own task queue, complaints and
    // audit trail from the database — on this device or any other. If it
    // fails, the operator must land back on this screen with the reason rather
    // than inside an application that will refuse every request it makes.
    setSigningIn(true)
    try {
      await authService.establishServerSession(selected, passphrase)
    } catch (cause) {
      setSigningIn(false)
      setError(
        cause instanceof ServiceError
          ? cause.message
          : 'The intelligence service could not be reached. Check the connection and try again.',
      )
      return
    }
    setSigningIn(false)

    const user = signIn(selected)
    if (!user) {
      setError('That position could not be resolved. Select another and try again.')
      return
    }
    setError(null)
    // Same order as `RoleLandingRedirect`: the operator's own preference, then
    // the Executive Overview as the platform's front page, then the role's
    // landing for principals who cannot read the Overview at all. Signing in
    // and opening `/` must arrive at the same screen.
    //
    // Ahead of all three sits `?next=` - the module the visitor clicked on the
    // portal before they had a session. An explicit click made a moment ago is
    // a stronger statement of intent than a preference saved weeks ago, so it
    // wins. It is resolved through `resolvePreferredLanding` exactly as the
    // saved preference is, which re-reads the permission engine: a route the
    // principal cannot open falls through to the ordinary order rather than
    // landing them on a refusal. Naming a route in the query string therefore
    // cannot grant one.
    const requested = resolvePreferredLanding(user, nextRoute)
    if (requested) {
      navigate(requested, { replace: true })
      return
    }

    // With nothing specifically requested, sign-in opens the corporation's
    // portal front page rather than dropping the officer straight into a
    // module. The portal is where the platform states what it is and offers
    // every surface at once; entering through it is the institutional route,
    // and it is one click from the console. A `?next=` click still wins,
    // because an explicit request made a moment ago beats a default.
    navigate(ROUTES.portal, { replace: true })
  }

  return (
    /* Keyed on the language, and carrying the switcher itself: a bilingual
       state's sign-in screen is the first thing an officer reads, so it has to
       be readable before they have an account, not after. */
    <div
      key={locale}
      className="relative grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
    >
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Institutional panel                                              */}
      {/* ---------------------------------------------------------------- */}
      <aside
        className="relative isolate hidden flex-col justify-between overflow-hidden px-12 py-11 text-white lg:flex"
        style={{ backgroundColor: municipality.branding.panelColor }}
      >
        {/* Photographs of the city, cross-fading. Decorative: the caption
            chip below names the one on screen. */}
        <div aria-hidden className="absolute inset-0 -z-10">
          {PANEL_PHOTOS.map((photo, index) => (
            <img
              key={photo.src}
              src={photo.src}
              alt=""
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              style={{ objectPosition: photo.focus }}
              className={cn(
                'login-kenburns absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms]',
                index === photoIndex ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))}
          <span className="absolute inset-0 bg-gradient-to-r from-[#0b1636]/90 via-[#0f2257]/55 to-[#0b1636]/20" />
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0b1636]/90 to-transparent" />
        </div>

        {/* Identity ---------------------------------------------------- */}
        <div className="relative">
          <div className="flex items-center gap-3">
            {/* The mark fills its box rather than sitting inset on a white
                chip: a photograph brings its own field. */}
            <img
              src={municipality.branding.markPath}
              alt=""
              className="h-12 w-12 rounded-xl object-cover shadow-lg ring-1 ring-white/25"
            />
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.6875rem] font-bold tracking-[0.14em] text-white uppercase ring-1 ring-white/25 backdrop-blur">
              {t('{0} · Maharashtra', corporationName(corporation))}
            </p>
          </div>

          <h1 className="mt-12 max-w-2xl text-[clamp(2.5rem,4vw,3.75rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-white drop-shadow-[0_2px_16px_rgb(0_0_0/0.45)]">
            {municipality.branding.productShortName}
          </h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed font-medium text-white/90">
            {municipality.branding.productSubtitle}
          </p>
          <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed text-white/70">
            {t('A governed urban intelligence and decision-support layer connecting municipal operations, infrastructure, finances, wards, projects, risks, citizen services and institutional knowledge into one evidence-backed operating environment for {0}.', cityName(corporation))}
          </p>

          {/* Published figures, read from the corporation record. */}
          <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t('Residents (Census 2011)'), value: formatNumber(corporation.population2011) },
              { label: t('Corporator seats'), value: corporation.electoralWards ? formatNumber(corporation.electoralWards) : '—' },
              { label: t('Budget {0}', corporation.budgetFinancialYear ?? ''), value: corporation.budgetCrore ? t('₹{0} cr', formatNumber(corporation.budgetCrore, 2)) : '—' },
              { label: t('Water supplied daily'), value: corporation.waterSupplyMLD ? t('{0} MLD', formatNumber(corporation.waterSupplyMLD)) : '—' },
              { label: t('Area'), value: t('{0} km²', formatNumber(corporation.areaSqKm, 2)) },
              { label: t('Administrative wards'), value: formatNumber(corporation.administrativeWards ?? municipality.administrativeUnits.wards) },
              { label: t('Sewage treatment'), value: corporation.sewageTreatmentMLD ? t('{0} MLD', formatNumber(corporation.sewageTreatmentMLD)) : '—' },
              { label: t('Established'), value: corporation.establishedYear ? String(corporation.establishedYear) : '—' },
            ]
              .filter((fact) => fact.value !== '—')
              .map((fact) => (
                <div key={fact.label} className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur-md">
                  <dd className="numeric text-[1.375rem] leading-none font-extrabold text-white">{fact.value}</dd>
                  <dt className="mt-1.5 text-[0.6875rem] leading-snug font-medium text-white/75">{fact.label}</dt>
                </div>
              ))}
          </dl>
        </div>

        {/* Capabilities + footer — anchors the panel and states what the
            platform is, without any environment or hierarchy detail. */}
        <div className="relative mt-10">
          <ul className="grid max-w-3xl grid-cols-1 gap-3 xl:grid-cols-3">
            {PANEL_PILLARS.map((pillar) => (
              <li key={pillar.title} className="rounded-xl bg-black/25 p-4 ring-1 ring-white/15 backdrop-blur-md">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-google-blue-500 to-intel-500 shadow-lg"
                  aria-hidden
                >
                  <pillar.icon className="h-4 w-4 text-white" />
                </span>
                <p className="mt-3 text-[0.8125rem] font-bold text-white">{pillar.title}</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-white/70">{pillar.detail}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5">
            <p className="text-[0.6875rem] font-medium tracking-wide text-white/60">{municipality.branding.deploymentLine}</p>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden>
                {PANEL_PHOTOS.map((photo, index) => (
                  <span
                    key={photo.src}
                    className={cn('h-1.5 rounded-full transition-all duration-500', index === photoIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40')}
                  />
                ))}
              </div>
              {activePhoto ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-[0.625rem] text-white/80 ring-1 ring-white/15 backdrop-blur">
                  <Camera className="h-3 w-3" aria-hidden />
                  {t('Photo: {0}', activePhoto.caption)}
                  <span className="text-white/55">· {photoCredit(activePhoto)}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Sign-in panel                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="relative flex min-h-screen flex-col justify-center bg-surface px-5 py-10 sm:px-10">
        {/* A rule in the platform's colours along the panel's head. */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-google-blue-600 via-intel-500 to-gold-500" />
        <div className="mx-auto w-full max-w-md">
          {/* Mobile brand - the institutional panel is hidden below lg, so a
              photograph of the city heads the form instead. */}
          <div className="relative isolate mb-8 overflow-hidden rounded-2xl p-5 shadow-lg lg:hidden">
            <img
              src={PANEL_PHOTOS[0]?.src}
              alt=""
              aria-hidden
              style={{ objectPosition: PANEL_PHOTOS[0]?.focus }}
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1636]/90 to-[#0f2257]/60" />
            <div className="flex items-center gap-3">
              <img
                src={municipality.branding.markPath}
                alt=""
                aria-hidden
                className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-xs ring-1 ring-white/30"
              />
              <p className="min-w-0 text-[0.9375rem] leading-snug font-bold text-white">{municipality.branding.productShortName}</p>
            </div>
            {PANEL_PHOTOS[0] ? (
              <p className="mt-3 text-[0.625rem] text-white/70">
                {t('Photo: {0}', PANEL_PHOTOS[0].caption)} · {photoCredit(PANEL_PHOTOS[0])}
              </p>
            ) : null}
          </div>

          <div className="mb-7">
            <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-600 uppercase">{t('Officer access')}</p>
            <h2 className="mt-1.5 text-[2rem] leading-tight font-extrabold tracking-[-0.02em] text-ink-900">{t('Sign in')}</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-500">
              {t('Select the position you are signing in as. The position determines your data scope, the modules you can reach and the actions you are permitted to take.')}
            </p>
          </div>

          {/* The position about to be assumed, named large before the form. */}
          {selectedUser && selectedRole ? (
            <div className="relative mb-5 flex items-center gap-3.5 overflow-hidden rounded-xl bg-gradient-to-br from-[#0f2257] to-google-blue-700 p-4 text-white shadow-lg">
              <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10" />
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[1rem] font-extrabold text-google-blue-700 shadow-md ring-4 ring-white/20"
              >
                {initialsOf(selectedUser.designation)}
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-[0.9375rem] font-bold">{selectedUser.designation}</p>
                <p className="truncate text-[0.6875rem] text-white/75">
                  {selectedRole.name !== selectedUser.designation
                    ? selectedRole.name
                    : grouped.find((group) => group.band === selectedRole.band)?.label}
                </p>
              </div>
              <span className="relative ml-auto shrink-0">
                <ClassificationBadge classification={selectedRole.maxClassification} />
              </span>
            </div>
          ) : null}

          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            {/* Position ------------------------------------------------- */}
            <div className="mb-4">
              <Label htmlFor="position" required>
                {t('Position')}
              </Label>
              <select
                id="position"
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value)
                  setError(null)
                }}
                className={cn(
                  'h-11 w-full cursor-pointer appearance-none rounded-lg border border-ink-200 bg-surface pr-9 pl-3',
                  'text-[0.875rem] font-medium text-ink-800 shadow-xs transition-all',
                  'focus:border-govt-400 focus:ring-[3px] focus:ring-govt-500/15 focus:outline-none',
                )}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23596e88' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                }}
              >
                {grouped.map((group) => (
                  <optgroup key={group.band} label={group.label}>
                    {group.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.designation}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Passphrase ------------------------------------------------ */}
            <div className="mb-4">
              <Label htmlFor="passphrase" required>
                {t('Passphrase')}
              </Label>
              <div className="relative">
                <Input
                  id="passphrase"
                  type={revealed ? 'text' : 'password'}
                  value={passphrase}
                  autoComplete="current-password"
                  placeholder={t('Enter the demonstration passphrase')}
                  onChange={(e) => {
                    setPassphrase(e.target.value)
                    if (error) setError(null)
                  }}
                  className={cn('h-11 pr-10 text-[0.875rem]', attempted && error ? 'border-crit-300' : '')}
                  aria-invalid={Boolean(attempted && error)}
                  aria-describedby={error ? 'passphrase-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700"
                  aria-label={revealed ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error ? (
                <p
                  id="passphrase-error"
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-crit-600"
                >
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}
            </div>

            <Button
              variant="primary"
              size="md"
              block
              type="submit"
              disabled={signingIn}
              className="h-12 text-[0.9375rem] font-bold shadow-lg"
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {signingIn ? t('Signing in…') : t('Sign in')}
            </Button>
          </form>

          {/* Access this position grants ------------------------------- */}
          {selectedUser && selectedRole ? (
            <Card tone="sunken" className="mt-5">
              <p className="label-institutional mb-2">{t('Access granted by this position')}</p>
              <dl className="space-y-1.5 text-[0.6875rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('Role')}</dt>
                  <dd className="text-right font-medium text-ink-800">{selectedRole.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('Ward scope')}</dt>
                  <dd className="text-right font-medium text-ink-800">
                    {selectedUser.scope.wardIds === '*'
                      ? `All ${municipality.administrativeUnits.wards} wards`
                      : `${selectedUser.scope.wardIds.length} ward(s)`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('Department scope')}</dt>
                  <dd className="text-right font-medium text-ink-800">
                    {selectedUser.scope.departmentIds === '*'
                      ? 'All departments'
                      : `${selectedUser.scope.departmentIds.length} department(s)`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('Classification ceiling')}</dt>
                  <dd className="text-right">
                    <ClassificationBadge classification={selectedRole.maxClassification} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">{t('Lands on')}</dt>
                  <dd className="text-right font-medium text-ink-800 capitalize">
                    {selectedRole.landingRoute.split('/').pop()?.replace(/-/g, ' ')}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 border-t border-ink-100 pt-2 text-[0.6875rem] leading-relaxed text-ink-500">
                {selectedRole.description}
              </p>
            </Card>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-ink-100 pt-5">
            <EnvironmentBadge />
            <Badge tone="muted" icon={<ShieldCheck className="h-3 w-3" />}>
              {t('Permission engine active')}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
