import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  CornerDownLeft,
  FileSearch,
  HardHat,
  MapPinned,
  MessagesSquare,
  Search,
  Siren,
  Sparkles,
  UserCog,
} from 'lucide-react'
import { ALL_NAV_ITEMS, ROUTES } from '@/config/navigation'
import { canAccess } from '@/security/access'
import { DEMO_USERS } from '@/auth/demo-users'
import { WARDS } from '@/data/reference'
import { PROJECTS, CONTRACTORS } from '@/data/finance.data'
import { DECISION_CASES, INCIDENTS } from '@/data/operations.data'
import { INTELLIGENCE_ITEMS, ALERTS } from '@/data/intelligence.data'
import { DATASETS } from '@/data/governance.data'
import { useAuthStore, useCurrentUser } from '@/stores/auth.store'
import { useCommandStore, useContextStore, useDrawerStore } from '@/stores/ui.store'
import { cn } from '@/utils/cn'
import { Badge, SeverityBadge } from '@/components/ui/badges'
import { t } from '@/i18n'

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  keywords?: string
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  run: () => void
}

/**
 * Command palette (Ctrl/Cmd + K).
 *
 * Combines navigation, entity search and municipal actions. Every result is
 * filtered by the acting principal's permissions before it is offered.
 */
export function CommandPalette(): React.JSX.Element | null {
  const open = useCommandStore((s) => s.paletteOpen)
  const setOpen = useCommandStore((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  const user = useCurrentUser()
  const switchRole = useAuthStore((s) => s.switchRole)
  const setWard = useContextStore((s) => s.setWard)
  const openDrawer = useDrawerStore((s) => s.open)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Global shortcuts: Ctrl/Cmd+K toggles the palette, Escape dismisses it.
  // Escape is handled here rather than on the dialog element so that it works
  // regardless of where focus currently sits inside the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const close = useCallback(() => setOpen(false), [setOpen])

  const go = useCallback(
    (path: string) => {
      navigate(path)
      close()
    },
    [navigate, close],
  )

  const commands = useMemo<Command[]>(() => {
    if (!user) return []
    const q = query.trim().toLowerCase()
    const out: Command[] = []

    // --- Navigation -------------------------------------------------------
    for (const item of ALL_NAV_ITEMS) {
      if (!canAccess(user, item.requires.resource, item.requires.action, item.domain ? { domain: item.domain } : {}).allowed)
        continue
      const Icon = item.icon
      out.push({
        id: `nav-${item.id}`,
        label: t('Go to {0}', item.label),
        hint: item.description,
        group: 'Navigate',
        icon: <Icon className="h-3.5 w-3.5" />,
        keywords: `${item.label} ${item.description}`,
        run: () => go(item.to),
      })
    }

    // --- Municipal actions ------------------------------------------------
    if (canAccess(user, 'decision', 'create').allowed) {
      out.push({
        id: 'act-decision',
        label: t('Create a decision case'),
        hint: t('Raise a decision case from an intelligence item'),
        group: 'Actions',
        icon: <ClipboardCheck className="h-3.5 w-3.5" />,
        keywords: 'create decision case new',
        run: () => go(`${ROUTES.decisions}?action=create`),
      })
    }
    if (canAccess(user, 'incident', 'create').allowed) {
      out.push({
        id: 'act-incident',
        label: t('Create an incident'),
        hint: t('Open a new incident in the unified incident register'),
        group: 'Actions',
        icon: <Siren className="h-3.5 w-3.5" />,
        keywords: 'create incident new emergency',
        run: () => go(`${ROUTES.disaster}?action=create`),
      })
    }
    out.push({
      id: 'act-critical',
      label: t('View critical alerts'),
      hint: t('Alerts at critical severity across every domain'),
      group: 'Actions',
      icon: <Siren className="h-3.5 w-3.5" />,
      keywords: 'critical alerts severity urgent',
      run: () => go(`${ROUTES.alerts}?severity=critical`),
    })
    out.push({
      id: 'act-copilot',
      label: t('Ask the Municipal Copilot'),
      hint: t('Governed, evidence-backed municipal question answering'),
      group: 'Actions',
      icon: <MessagesSquare className="h-3.5 w-3.5" />,
      keywords: 'ai copilot ask question analysis',
      run: () => go(ROUTES.copilot),
    })
    out.push({
      id: 'act-brief',
      label: t('Generate executive brief'),
      hint: t('Compose the current executive brief from live platform data'),
      group: 'Actions',
      icon: <Sparkles className="h-3.5 w-3.5" />,
      keywords: 'executive brief generate report commissioner',
      run: () => go(`${ROUTES.executive}?action=brief`),
    })

    // --- Ward context -----------------------------------------------------
    const authorisedWards =
      user.scope.wardIds === '*' ? WARDS : WARDS.filter((w) => (user.scope.wardIds as string[]).includes(w.id))
    for (const ward of authorisedWards) {
      out.push({
        id: `ward-${ward.id}`,
        label: `${ward.code} - ${ward.name.split(' · ')[0]}`,
        hint: t('Set ward context · health {0}/100 · risk {1}/100', ward.healthScore, ward.riskScore),
        group: 'Wards',
        icon: <MapPinned className="h-3.5 w-3.5" />,
        keywords: `${ward.code} ${ward.name} ${ward.region} ward change`,
        run: () => {
          setWard(ward.id)
          go(`${ROUTES.wards}?ward=${ward.id}`)
        },
      })
    }

    // --- Entity search (only once the operator has typed) -----------------
    if (q.length >= 2) {
      for (const project of PROJECTS) {
        if (!project.name.toLowerCase().includes(q) && !project.reference.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'project', 'view', { wardIds: project.wardIds, departmentId: project.departmentId, classification: project.classification }).allowed)
          continue
        out.push({
          id: `prj-${project.id}`,
          label: project.name,
          hint: t('{0} · risk {1}/100 · {2}% complete', project.reference, project.riskScore, project.completionPct),
          group: 'Projects',
          icon: <HardHat className="h-3.5 w-3.5" />,
          run: () => {
            openDrawer({ kind: 'project', id: project.id })
            go(ROUTES.projects)
          },
        })
        if (out.filter((c) => c.group === 'Projects').length > 6) break
      }

      for (const item of INTELLIGENCE_ITEMS) {
        if (!item.title.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'intelligence', 'view', { wardIds: item.wardIds, departmentId: item.departmentId, domain: item.domain, classification: item.classification }).allowed)
          continue
        out.push({
          id: `int-${item.id}`,
          label: item.title,
          hint: `${item.type} · ${item.status}`,
          group: 'Intelligence',
          icon: <FileSearch className="h-3.5 w-3.5" />,
          severity: item.severity,
          run: () => {
            openDrawer({ kind: 'intelligence', id: item.id })
            go(ROUTES.intelligenceFeed)
          },
        })
        if (out.filter((c) => c.group === 'Intelligence').length > 6) break
      }

      for (const decision of DECISION_CASES) {
        if (!decision.title.toLowerCase().includes(q) && !decision.reference.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'decision', 'view', { wardIds: decision.wardIds, classification: decision.classification }).allowed) continue
        out.push({
          id: `dec-${decision.id}`,
          label: decision.title,
          hint: `${decision.reference} · ${decision.status}`,
          group: 'Decisions',
          icon: <ClipboardCheck className="h-3.5 w-3.5" />,
          severity: decision.severity,
          run: () => {
            openDrawer({ kind: 'decision', id: decision.id })
            go(ROUTES.decisions)
          },
        })
        if (out.filter((c) => c.group === 'Decisions').length > 4) break
      }

      for (const incident of INCIDENTS) {
        if (!incident.title.toLowerCase().includes(q) && !incident.reference.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'incident', 'view', { wardId: incident.wardId, classification: incident.classification }).allowed) continue
        out.push({
          id: `inc-${incident.id}`,
          label: incident.title,
          hint: `${incident.reference} · ${incident.status}`,
          group: 'Incidents',
          icon: <Siren className="h-3.5 w-3.5" />,
          severity: incident.severity,
          run: () => {
            openDrawer({ kind: 'incident', id: incident.id })
            go(ROUTES.disaster)
          },
        })
        if (out.filter((c) => c.group === 'Incidents').length > 4) break
      }

      for (const alert of ALERTS) {
        if (!alert.title.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'alert', 'view', { wardIds: alert.wardIds, classification: alert.classification }).allowed) continue
        out.push({
          id: `alt-${alert.id}`,
          label: alert.title,
          hint: t('Alert · {0}', alert.status),
          group: 'Alerts',
          icon: <Siren className="h-3.5 w-3.5" />,
          severity: alert.severity,
          run: () => go(ROUTES.alerts),
        })
        if (out.filter((c) => c.group === 'Alerts').length > 4) break
      }

      for (const contractor of CONTRACTORS) {
        if (!contractor.name.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'procurement', 'view').allowed) continue
        out.push({
          id: `ctr-${contractor.id}`,
          label: contractor.name,
          hint: t('{0} active contracts · delivery index {1}/100', contractor.activeContracts, contractor.performanceIndex),
          group: 'Contractors',
          icon: <Building2 className="h-3.5 w-3.5" />,
          run: () => go(ROUTES.procurement),
        })
        if (out.filter((c) => c.group === 'Contractors').length > 3) break
      }

      for (const dataset of DATASETS) {
        if (!dataset.name.toLowerCase().includes(q)) continue
        if (!canAccess(user, 'dataset', 'view', { classification: dataset.classification }).allowed) continue
        out.push({
          id: `ds-${dataset.id}`,
          label: dataset.name,
          hint: t('Dataset · {0} · {1}', dataset.classification, dataset.sourceSystem),
          group: 'Datasets',
          icon: <FileSearch className="h-3.5 w-3.5" />,
          run: () => go(ROUTES.privacy),
        })
        if (out.filter((c) => c.group === 'Datasets').length > 3) break
      }
    }

    // --- Demonstration role switching ------------------------------------
    for (const demoUser of DEMO_USERS) {
      out.push({
        id: `role-${demoUser.id}`,
        label: t('Act as {0}', demoUser.name),
        hint: demoUser.designation,
        group: 'Change role',
        icon: <UserCog className="h-3.5 w-3.5" />,
        keywords: `role switch change ${demoUser.name} ${demoUser.designation}`,
        run: () => {
          const next = switchRole(demoUser.id)
          close()
          if (next) {
            const role = next.roleId
            const landing = ALL_NAV_ITEMS.find((i) => i.id === 'executive')
            navigate(
              role === 'ward-officer'
                ? ROUTES.wards
                : role === 'finance-officer'
                  ? ROUTES.budget
                  : role === 'disaster-management-officer'
                    ? ROUTES.situationRoom
                    : role === 'security-administrator'
                      ? ROUTES.security
                      : role === 'ai-governance-officer'
                        ? ROUTES.aiGovernance
                        : role === 'auditor'
                          ? ROUTES.evidenceAudit
                          : (landing?.to ?? ROUTES.executive),
            )
          }
        },
      })
    }

    if (!q) return out.filter((c) => c.group !== 'Change role').slice(0, 40)

    return out
      .filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q))
      .slice(0, 40)
  }, [user, query, go, setWard, switchRole, navigate, close, openDrawer])

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of commands) {
      const list = map.get(cmd.group) ?? []
      list.push(cmd)
      map.set(cmd.group, list)
    }
    return Array.from(map.entries())
  }, [commands])

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flat[activeIndex]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  let runningIndex = -1

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      <div className="animate-in-fade absolute inset-0 bg-ink-900/35 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Command palette')}
        className="animate-in-scale relative flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-100 bg-surface shadow-overlay"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-ink-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Arrow / Enter navigation lives on the input rather than the
            // dialog container: the input holds focus throughout, and a
            // keyboard handler belongs on an interactive element.
            onKeyDown={onKeyDown}
            placeholder={t('Search wards, projects, intelligence, decisions, incidents - or type a command')}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-800 placeholder:text-ink-300 focus:outline-none"
            aria-label={t('Command palette search')}
          />
          <kbd className="shrink-0 rounded border border-ink-200 bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-400">
            {t('Esc')}
          </kbd>
        </div>

        <div ref={listRef} className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-ink-400">
              {t('No authorised result matches “{0}”. Results are filtered by your access scope.', query)}
            </p>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="label-institutional px-2 py-1.5">{group}</p>
                <ul>
                  {items.map((cmd) => {
                    runningIndex += 1
                    const index = runningIndex
                    const active = index === activeIndex
                    return (
                      <li key={cmd.id}>
                        <button
                          type="button"
                          data-index={index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={cmd.run}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-govt-50' : 'hover:bg-ink-50',
                          )}
                        >
                          <span className={cn('shrink-0', active ? 'text-govt-600' : 'text-ink-400')}>{cmd.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.8125rem] font-medium text-ink-800">{cmd.label}</span>
                            {cmd.hint ? (
                              <span className="block truncate text-[0.6875rem] text-ink-400">{cmd.hint}</span>
                            ) : null}
                          </span>
                          {cmd.severity ? <SeverityBadge severity={cmd.severity} withDot={false} /> : null}
                          {active ? (
                            <CornerDownLeft className="h-3 w-3 shrink-0 text-govt-500" aria-hidden />
                          ) : (
                            <ArrowRight className="h-3 w-3 shrink-0 text-ink-200" aria-hidden />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-ink-100 bg-surface-sunken px-4 py-2 text-[0.625rem] text-ink-400">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-ink-200 bg-surface px-1 font-mono">↑</kbd>
            <kbd className="rounded border border-ink-200 bg-surface px-1 font-mono">↓</kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-ink-200 bg-surface px-1 font-mono">↵</kbd> select
          </span>
          <div className="flex-1" />
          <Badge tone="muted">{t('Results filtered by your access scope')}</Badge>
        </div>
      </div>
    </div>,
    document.body,
  )
}
