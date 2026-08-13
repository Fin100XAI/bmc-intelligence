import { TENANT_ID, activeCorporation } from '@/config/municipality.config'
import type { User } from '@/types/organisation'
import { isoFromAnchor } from '@/utils/deterministic'
import { initials } from '@/utils/format'
import { WARDS, ZONES, officerDesignation, officerDisplayName } from '@/data/reference'
import { registerLayer } from '@/data/runtime'
import { t } from '@/i18n'

/**
 * Demonstration authentication profiles.
 *
 * These are illustrative principals for a demonstration environment. No
 * password, token or credential material of any kind is modelled, stored or
 * transmitted. Production deployment requires an institutional identity
 * provider with enforced multi-factor authentication.
 *
 * The profiles are rebuilt whenever the active municipal corporation changes.
 * That is not cosmetic. `scopeToTenant` in `src/services/client.ts` filters
 * every record by `user.tenantId`, and the ward-scoped profiles carry real
 * ward identifiers in `scope.wardIds`. A principal still stamped with the
 * previous corporation would see a completely empty platform - every list
 * silently returning zero rows, with no error to explain it.
 */

function makeUser(
  input: Omit<User, 'tenantId' | 'avatarInitials' | 'lastSignInAt' | 'status'> &
    Partial<Pick<User, 'lastSignInAt' | 'status'>>,
): User {
  return {
    ...input,
    tenantId: TENANT_ID,
    avatarInitials: initials(input.name),
    lastSignInAt: input.lastSignInAt ?? isoFromAnchor(-180),
    status: input.status ?? 'active',
  }
}

export let DEMO_USERS: User[] = []
export let USER_BY_ID: Map<string, User> = new Map()

/**
 * Shared demonstration passphrase.
 *
 * This gates entry to the demonstration environment so it is not open to
 * anyone who reaches the URL. It is NOT a security control and must never be
 * described as one:
 *
 *   - it is identical for every profile;
 *   - it is verified in the browser, so it is visible in the bundle and
 *     trivially bypassed by anyone who wishes to;
 *   - it protects nothing, because every figure behind it is modelled
 *     demonstration data.
 *
 * Production deployment replaces this entirely with an institutional identity
 * provider and enforced multi-factor authentication. The interface says so.
 */
export const DEMO_ACCESS_PASSPHRASE = 'Maha@2026'

/**
 * Profiles offered at sign-in, ordered by institutional seniority.
 *
 * The sign-in screen identifies a principal by POSITION, never by the name of
 * the officer holding it - the position is what determines authority, scope
 * and permitted action. Officer names appear later, on accountability
 * surfaces (decisions, assignments, the audit trail), where naming the
 * responsible individual is the entire point.
 */
export const SIGN_IN_BAND_ORDER = ['executive', 'senior', 'oversight', 'operational'] as const

/** Profiles surfaced on the sign-in screen, in institutional order. */
export let FEATURED_DEMO_PROFILES: Array<{
  userId: string
  accessSummary: string
}> = []

export function userDisplayName(id: string | undefined): string {
  if (!id) return 'Unassigned'
  return USER_BY_ID.get(id)?.name ?? id
}

/**
 * Resolves an owner identifier from either identity space.
 *
 * An operational record names the officer responsible for it as either a
 * sign-in principal (`user-…`) or an officer in the corporation's staff
 * directory (`off-…`). Both are legitimate - a task raised in the platform is
 * owned by whoever it was assigned to, while a task the corporation was
 * already carrying is owned by the post that holds it. This module is the only
 * one that sees both catalogues, so the resolution belongs here rather than
 * being re-derived at each display site.
 */
export function ownerDisplayName(id: string | undefined): string {
  if (!id) return 'Unassigned'
  const principal = USER_BY_ID.get(id)
  return principal ? principal.name : officerDisplayName(id)
}

export function ownerDesignation(id: string | undefined): string {
  if (!id) return '-'
  const principal = USER_BY_ID.get(id)
  return principal ? principal.designation : officerDesignation(id)
}

registerLayer(() => {
  const corp = activeCorporation
  const unit = corp.wardTerminology
  const tier = corp.zoneTerminology
  const code = corp.shortName.replace(/[^A-Za-z]/g, '').toUpperCase()
  const domain = `demo.${corp.id}.local`

  // Two ward-scoped principals. Chosen by position in the corporation's own
  // division list rather than by a Mumbai ward code, so every corporation
  // yields a valid, populated scope: the most populous division and a
  // mid-sized one, which is where ward-level intelligence is most legible.
  const byPopulation = [...WARDS].sort((a, b) => b.population - a.population)
  const primaryWard = byPopulation[0] ?? WARDS[0]
  const secondaryWard = byPopulation[Math.min(2, Math.max(0, byPopulation.length - 1))] ?? primaryWard

  // The zone-scoped deputy takes the zone with the most wards under it, so the
  // scope demonstrates a real multi-ward jurisdiction rather than a single one.
  const scopedZone = [...ZONES].sort((a, b) => b.wardIds.length - a.wardIds.length)[0]
  const scopedZoneWards = scopedZone?.wardIds ?? []

  const primaryWardId = primaryWard?.id ?? ''
  const secondaryWardId = secondaryWard?.id ?? ''
  const primaryWardLabel = primaryWard ? `${primaryWard.code} (${primaryWard.name.split(' · ')[0]})` : unit
  const secondaryWardLabel = secondaryWard ? `${secondaryWard.code} (${secondaryWard.name.split(' · ')[0]})` : unit
  const zoneLabel = scopedZone?.name ?? `${tier} I`

  // A ward officer answers for every service delivered in their ward, which
  // includes the obligatory services as much as the engineering ones - the
  // school building, the community toilet block, the street light and the
  // garden are all theirs to account for.
  const fieldDomains: User['scope']['domains'] = [
    'wards', 'water', 'sewerage', 'stormwater', 'waste', 'roads', 'health',
    'citizen-services', 'monsoon', 'assets', 'projects', 'executive',
    'education', 'housing', 'street-lighting', 'licensing', 'registration', 'gardens', 'council',
    // The ward officer is who a Removal of Encroachments squad coordinates
    // with on the ground, so the register is in the ward officer's own sight.
    'enforcement',
    // Heritage sites and locally-run consultations are both ward-level
    // field responsibilities.
    'heritage', 'civic-participation',
  ]

  DEMO_USERS = [
    makeUser({
      id: 'user-commissioner',
      name: t('A. R. Deshpande'),
      designation: t('Municipal Commissioner'),
      roleId: 'municipal-commissioner',
      departmentId: 'dept-commissioner',
      email: `commissioner@${domain}`,
      employeeCode: `${code}-EXEC-0001`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-42),
    }),
    makeUser({
      id: 'user-addl-commissioner',
      name: t('S. V. Kulkarni'),
      designation: t('Additional Municipal Commissioner (Projects)'),
      roleId: 'additional-commissioner',
      departmentId: 'dept-projects',
      email: `addl.commissioner@${domain}`,
      employeeCode: `${code}-EXEC-0004`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-96),
    }),
    makeUser({
      id: 'user-dmc-zone3',
      name: t('P. M. Sawant'),
      designation: t('Deputy Municipal Commissioner - {0}', zoneLabel),
      roleId: 'deputy-commissioner',
      departmentId: 'dept-commissioner',
      email: `dmc.${(scopedZone?.code ?? 'z1').toLowerCase()}@${domain}`,
      employeeCode: `${code}-EXEC-0012`,
      scope: { wardIds: scopedZoneWards, departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-320),
    }),
    makeUser({
      id: 'user-ward-officer',
      name: t('R. D. Gaikwad'),
      designation: t('{0} Officer - {1}', unit, primaryWardLabel),
      roleId: 'ward-officer',
      departmentId: 'dept-commissioner',
      wardId: primaryWardId,
      // This profile IS the ward's officer in the staff directory, so the
      // ward's own tasks, incidents and complaints resolve to them.
      officerId: `off-ward-${primaryWardId}`,
      email: `wo.${(primaryWard?.code ?? 'w1').toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain}`,
      employeeCode: `${code}-WO-0114`,
      scope: { wardIds: [primaryWardId], departmentIds: '*', domains: fieldDomains },
      mfaEnrolled: false,
      lastSignInAt: isoFromAnchor(-58),
    }),
    makeUser({
      id: 'user-chief-engineer',
      name: t('N. B. Joshi'),
      designation: t('Chief Engineer - Infrastructure Delivery'),
      roleId: 'chief-engineer',
      departmentId: 'dept-projects',
      email: `ce.infra@${domain}`,
      employeeCode: `${code}-ENG-0021`,
      scope: {
        wardIds: '*',
        departmentIds: ['dept-projects', 'dept-roads', 'dept-stormwater', 'dept-hydraulic', 'dept-sewerage', 'dept-procurement'],
        domains: '*',
      },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-210),
    }),
    makeUser({
      id: 'user-finance',
      name: t('K. S. Bhosale'),
      designation: t('Chief Accountant (Finance)'),
      roleId: 'finance-officer',
      departmentId: 'dept-finance',
      email: `finance.chief@${domain}`,
      employeeCode: `${code}-FIN-0007`,
      scope: {
        wardIds: '*',
        departmentIds: '*',
        // Licence fees are a revenue head the Finance Officer answers for, so
        // the licensing regime is within their sight even though enforcement
        // is the Licence Department's.
        domains: ['budget', 'revenue', 'property', 'procurement', 'projects', 'executive', 'licensing'],
      },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-134),
    }),
    makeUser({
      id: 'user-disaster',
      name: t('V. T. Mhatre'),
      designation: t('Director - Disaster Management Cell'),
      roleId: 'disaster-management-officer',
      departmentId: 'dept-disaster',
      email: `dm.director@${domain}`,
      employeeCode: `${code}-DM-0003`,
      scope: {
        wardIds: '*',
        departmentIds: '*',
        domains: ['disaster', 'monsoon', 'emergency', 'stormwater', 'hospitals', 'health', 'roads', 'wards', 'executive'],
      },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-16),
    }),
    makeUser({
      id: 'user-health',
      name: t('Dr. M. A. Naik'),
      designation: t('Executive Health Officer'),
      roleId: 'health-officer',
      departmentId: 'dept-health',
      email: `eho@${domain}`,
      employeeCode: `${code}-PH-0002`,
      scope: {
        wardIds: '*',
        departmentIds: ['dept-health', 'dept-hospitals', 'dept-solid-waste', 'dept-environment'],
        domains: ['health', 'hospitals', 'environment', 'waste', 'wards', 'citizen-services', 'executive'],
      },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-402),
    }),
    makeUser({
      id: 'user-auditor',
      name: t('G. L. Parab'),
      designation: t('Chief Internal Auditor'),
      roleId: 'auditor',
      departmentId: 'dept-finance',
      email: `audit.chief@${domain}`,
      employeeCode: `${code}-AUD-0001`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-1440),
    }),
    makeUser({
      id: 'user-security',
      name: t('T. S. Rane'),
      designation: t('Security Administrator - Information Security Office'),
      roleId: 'security-administrator',
      departmentId: 'dept-security',
      email: `secadmin@${domain}`,
      employeeCode: `${code}-SEC-0001`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-28),
    }),
    makeUser({
      id: 'user-ai-governance',
      name: t('Dr. S. R. Iyer'),
      designation: t('AI Governance Officer'),
      roleId: 'ai-governance-officer',
      departmentId: 'dept-ai-governance',
      email: `ai.governance@${domain}`,
      employeeCode: `${code}-AIG-0001`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-76),
    }),
    makeUser({
      id: 'user-operator',
      name: t('D. K. Shinde'),
      designation: t('Control Room Operator - Emergency Operations Centre'),
      roleId: 'operator',
      departmentId: 'dept-disaster',
      email: `eoc.operator@${domain}`,
      employeeCode: `${code}-OPS-0044`,
      scope: {
        wardIds: '*',
        departmentIds: '*',
        // The control room takes street-light failure reports out of hours,
        // which is why lighting is in an operator's scope and not only the
        // Electrical Department's.
        domains: ['disaster', 'emergency', 'monsoon', 'roads', 'wards', 'citizen-services', 'street-lighting'],
      },
      mfaEnrolled: false,
      lastSignInAt: isoFromAnchor(-8),
    }),
    makeUser({
      id: 'user-analyst',
      name: t('A. P. Tambe'),
      designation: t('Municipal Analyst - Intelligence Unit'),
      roleId: 'analyst',
      departmentId: 'dept-it',
      email: `analyst.intel@${domain}`,
      employeeCode: `${code}-ANL-0019`,
      scope: { wardIds: '*', departmentIds: '*', domains: '*' },
      mfaEnrolled: true,
      lastSignInAt: isoFromAnchor(-260),
    }),
    makeUser({
      id: 'user-corporator',
      name: t('J. B. Pawar'),
      designation: t('Corporator - {0}', primaryWardLabel),
      roleId: 'corporator',
      // A corporator belongs to the Corporation in session, not to a
      // department. The Municipal Secretary's office is their point of contact
      // with the administration, which is why it is recorded here.
      departmentId: 'dept-secretary',
      wardId: primaryWardId,
      email: `corporator.${(primaryWard?.code ?? 'w1').toLowerCase().replace(/[^a-z0-9]/g, '')}@${domain}`,
      employeeCode: `${code}-ELE-0087`,
      scope: {
        wardIds: [primaryWardId],
        departmentIds: '*',
        domains: [
          'council', 'wards', 'executive', 'water', 'sewerage', 'stormwater', 'waste', 'roads',
          'health', 'citizen-services', 'education', 'housing', 'street-lighting', 'gardens',
          'registration', 'licensing', 'monsoon', 'projects',
          // A corporator's own casework and the state directives bearing on
          // their ward are squarely within an elected member's sight; the
          // Corporation's litigation strategy is not, which is why `legal`
          // stays off this list.
          'enforcement', 'correspondence', 'heritage', 'civic-participation',
        ],
      },
      mfaEnrolled: false,
      lastSignInAt: isoFromAnchor(-94),
    }),
    makeUser({
      id: 'user-ward-officer-kw',
      name: t('S. H. Kadam'),
      designation: t('{0} Officer - {1}', unit, secondaryWardLabel),
      roleId: 'ward-officer',
      departmentId: 'dept-commissioner',
      wardId: secondaryWardId,
      officerId: `off-ward-${secondaryWardId}`,
      email: `wo.${(secondaryWard?.code ?? 'w2').toLowerCase().replace(/[^a-z0-9]/g, '')}.2@${domain}`,
      employeeCode: `${code}-WO-0131`,
      scope: { wardIds: [secondaryWardId], departmentIds: '*', domains: fieldDomains },
      mfaEnrolled: false,
      lastSignInAt: isoFromAnchor(-186),
    }),
  ]

  USER_BY_ID = new Map(DEMO_USERS.map((u) => [u.id, u]))

  FEATURED_DEMO_PROFILES = [
    {
      userId: 'user-commissioner',
      accessSummary: `${corp.city}-wide intelligence, decision approval and escalation authority.`,
    },
    {
      userId: 'user-ward-officer',
      accessSummary: `${primaryWardLabel} only - service delivery, tasks and local intelligence.`,
    },
    {
      userId: 'user-corporator',
      accessSummary: `Elected member for ${primaryWardLabel} - the matters before the house, and their own ${unit.toLowerCase()}. No administrative authority.`,
    },
    { userId: 'user-finance', accessSummary: 'Budget, revenue, property and procurement intelligence.' },
    { userId: 'user-disaster', accessSummary: 'Situation Room, monsoon preparedness and emergency response.' },
    { userId: 'user-security', accessSummary: 'Security posture, identity, access policy and audit.' },
    { userId: 'user-ai-governance', accessSummary: 'Model registry, prompt governance, AI risk and human oversight.' },
    { userId: 'user-chief-engineer', accessSummary: 'Projects, contracts, roads and infrastructure delivery.' },
    { userId: 'user-auditor', accessSummary: 'Read-only assurance across decisions, evidence and finance.' },
  ]
})
