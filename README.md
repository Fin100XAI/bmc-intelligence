# BMC Intelligence Infrastructure

**Maha AI — Urban Intelligence Infrastructure**
Sovereign Urban Intelligence & Decision Infrastructure for municipal corporations
Deployment profile: any of the 29 municipal corporations of Maharashtra, selected at runtime

---

> ### Demonstration Environment
> Figures shown in this environment are **modelled demonstration data** and are **not connected to live municipal departmental systems**. No municipal, state or third-party system is contacted by this application. No security certification, accreditation or regulatory approval is claimed or implied.

---

## 1. Product overview

This is not another municipal dashboard.

It is a **governed urban intelligence and decision-support layer** that connects municipal operations, infrastructure, finances, wards, projects, risks, citizen services and institutional knowledge into one evidence-backed operating environment for a municipal corporation.

Conventional business intelligence stops at *information*. This platform continues through the full institutional chain:

```
DATA → INFORMATION → INTELLIGENCE → RECOMMENDATION → DECISION → ACTION → OUTCOME → EVIDENCE
```

The operating loop the platform implements is:

```
Observe → Detect → Understand → Predict → Prioritise → Decide → Assign → Act → Monitor → Verify → Audit → Learn
```

**The central architectural principle:** the platform *augments* existing municipal systems. Departmental systems remain the systems of record. This platform is the **intelligence system of engagement and decision support**, and never writes back into an authoritative source.

### Platform hierarchy

```
National Governance Intelligence
            ↓
Maha State Intelligence
            ↓
Urban Intelligence Infrastructure          ← reusable platform core
            ↓
BMC Intelligence                     ← the active corporation
            ↓
Department Intelligence
            ↓
Ward Intelligence
            ↓
Zone Intelligence
            ↓
Asset / Project / Service Intelligence
```

### Multi-corporation deployment

The platform core is deployment-neutral. The **corporation selector in the command bar** switches the active municipal corporation while the application is running, and every intelligence layer — reference data, operations, finance, governance, the knowledge graph, the map — is rebuilt for it. All **29 municipal corporations of Maharashtra** are available, from Brihanmumbai to Jalna.

Two kinds of figure appear, and the platform does not blur them:

- **Reference statistics are published figures** — population, area, administrative division names and counts, budget outlay, water supply, waste tonnage and road length are each corporation's own published record. Where a corporation does not publish a figure, it is modelled from a stated per-capita norm and the interface says so rather than presenting it as published.
- **Operational figures are modelled.** Complaints, incidents, projects, readiness scores and every other operational record are deterministic demonstration data, generated per corporation and scaled to its published size. A corporation of 285,000 residents is never shown a metropolis's caseload.

Place names follow the same rule. Each corporation's own localities and water bodies are used where it publishes them; facilities are given plainly constructed labels otherwise. A real named asset is never borrowed from another city.

**Spatial representation.** Brihanmumbai keeps its hand-authored ward geometry. Every other corporation is drawn as a **generated schematic tessellation** carrying that corporation's own published division names and counts. Neither is official GIS boundary data, and every spatial surface says so.

### Bilingual interface — English and मराठी

Maharashtra's official language is Marathi, so the platform is bilingual rather than English-with-a-translation-layer. A segmented control in the command bar — and on the sign-in screen, before an officer has an account — switches the entire interface. Navigation, headings, table columns, status chips, tooltips, empty states, error text, the ward and department registers, the generated municipal narrative and the Copilot's answers are all rendered in the chosen language.

Four properties are load-bearing:

- **Switching language re-describes the city; it does not move it.** Alert titles, defect summaries and register rows are composed inside the seeded data layers, so a switch runs the same rebuild a corporation switch runs. Seeds are keyed on the corporation and never on the language, so **every figure on screen before the switch is the same figure after it** — asserted by `npm run smoke:i18n`, which diffs every number in the layer graph across a switch and back.
- **Marathi is the institution's own language, not a transliteration.** Each corporation's registered Marathi name is used (`बृहन्मुंबई महानगरपालिका`), ward and department names come from the corporation's published divisions, and the register is administrative Marathi as the state government writes it.
- **Figures stay in Latin digits.** Marathi's CLDR default is the Devanagari numbering system, which would render a collection figure as १२,३४,५६७ — unreadable beside the source systems an officer reconciles against, and unalignable in a tabular column. Government of Maharashtra practice is Marathi words with Latin figures, which is what the platform produces: Marathi month names, Marathi units, Latin digits.
- **Source citations are never translated.** A provenance note quoting the Census of India or the Directorate of Municipal Administration is a quotation, and is reproduced in the language it was published in.

No font is fetched over the network — as with everything else in this build. The Devanagari faces sit inside the Latin type stack rather than beside it, because a bilingual line mixes scripts and the browser falls through the stack per character.

Coverage is a gate, not an aspiration. `npm run audit:i18n` fails the build on a message with no translation, a placeholder dropped from or invented in a translated sentence, a catalogue entry no screen asks for, and on any translation evaluated at module scope — which would otherwise freeze in whatever language was active at import.

---

## 2. Setup

```bash
npm install
npm run dev        # development server
npm run build      # type-check then production build
npm run lint       # oxlint
npm run typecheck  # tsc project build
npm run smoke      # runtime smoke test across data, domain, service and AI layers
npm run preview:design  # static design preview rendered from the compiled stylesheet
npm run verify     # typecheck + lint + build + smoke
npm run preview    # serve the production build
```

### Verification status

| Gate | Result |
| --- | --- |
| `tsc -b` | **0 errors** |
| `oxlint src` | **0 errors**, 89 advisory warnings |
| `vite build` | **succeeds** — 100 chunks, every route code-split |
| `npm run smoke` | **38/38 checks pass** |

The smoke test (`scripts/smoke.mjs`) loads the real application modules through
Vite's SSR pipeline and exercises the data, domain, security, workflow, service
and AI layers end to end. It asserts determinism, that every cited evidence
identifier resolves, that the permission engine denies out-of-scope reads on the
correct basis, that every workflow reaches a terminal state, that scenario
engines respond monotonically to their inputs, that the AI gateway blocks
reserved acts before generation, and that no navigation item points at an
undeclared route.

Node 20+ is required (developed against Node 24). No environment variables are needed — with none set, the platform runs entirely on the local deterministic demonstration data services.

### Optional: running against MongoDB

One vertical slice — users, wards, complaints and the audit trail — can run against a real MongoDB database through the API server in `server/`. This is what makes the audit trail survive a reload.

```bash
cp .env.example .env.local   # fill in MONGODB_URI and SESSION_SECRET
npm run db:seed              # load the deterministic datasets into MongoDB
npm run server               # API on :4000
npm run dev                  # application on :5173

npm run db:status            # what is actually in the database
npm run db:verify            # walk the audit chain and report any break
npm run db:import -- --collection complaints --file ./dump.json --dry-run
```

Setting `VITE_API_BASE_URL` is the switch. Leave it empty and nothing changes. **[`server/README.md`](server/README.md) is the full guide**, including Atlas setup and what is and is not migrated.

---

## 3. Architecture

```
src/
  app/          Application root, query client, providers
  routes/       Route table, authentication guard, permission guard
  layouts/      Application shell (sidebar, top bar, context bar, drawer host)
  pages/        One file per screen, grouped by section
  components/   Design system: ui, charts, cards, drawers, filters, layout, map
  features/     Cross-cutting feature composition
  domains/      Per-domain computation engines and selectors (pure TypeScript)
  services/     Demonstration service layer — the transport seam
  data/         Deterministic demonstration datasets and generators
  ai/           AI provider abstraction, gateway policy, mock provider
  auth/         Demonstration principals
  security/     Permission model, role catalogue, canAccess engine
  governance/   Governance surfaces and policy helpers
  workflows/    Reusable workflow state machines
  evidence/     Provenance helpers
  hooks/        Query bridge and interface hooks
  stores/       Zustand stores (interface state only)
  schemas/      Zod validation schemas
  types/        Domain model
  utils/        Deterministic generation, formatting, class merging
  config/       Municipality configuration, navigation
  styles/       Design tokens and global styles
```

### Data flow — the only permitted path

```
service → TanStack Query hook → domain model → component
```

No page component imports a data module for its figures. Everything routes through `src/services/*`, which is the single seam a real backend replaces.

### Layer responsibilities

| Layer | Responsibility |
| --- | --- |
| `data/` | Deterministic demonstration datasets. Seeded, immutable, never random per render. |
| `services/` | Async API simulation, tenant scoping, permission filtering, workflow transitions, audit emission. **The only layer that knows the backend is local.** |
| `domains/` | Pure computation: risk engines, composite indices, scenario models, cross-domain correlation. No React. |
| `hooks/` | `useServiceQuery` / `useServiceAction` — the bridge into TanStack Query, injecting the acting principal. |
| `components/` | Presentation only. No business logic, no AI logic, no data access. |

---

## 4. Demonstration authentication

Sign-in identifies a principal by **position**, not by the name of the officer holding it — the position is what determines authority, data scope and permitted action. Officer names appear later, on accountability surfaces (decisions, assignments, the audit trail), where naming the responsible individual is the entire point.

Entry is gated by a shared demonstration passphrase:

```
Maha@2026
```

**This is not a security control, and the sign-in screen says so.** It is identical for every position and protects nothing, because every figure behind it is modelled demonstration data. Its only purpose is to stop the demonstration being wide open to anyone who reaches the URL.

Where it is checked depends on the mode. Without the API it is compared in the browser, so it is present in the bundle and trivially bypassed, and no token or credential material of any kind is stored or transmitted — only the selected position identifier is persisted, so a refresh keeps the role. With the API configured it is held in the server's environment, compared there, and never sent to the client; the server replies with a signed `httpOnly` session cookie, and the permission engine runs server-side against the authoritative `User` record. That removes the "a caller can simply claim to be the Commissioner" problem. It does not make a single shared passphrase an institutional credential.

Production deployment replaces this entirely with an institutional identity provider and enforced multi-factor authentication.

| Position | Role | Scope | Lands on |
| --- | --- | --- | --- |
| Municipal Commissioner | Municipal Commissioner | All wards, all departments, all domains | Commissioner Cockpit |
| Additional Municipal Commissioner (Projects) | Additional Municipal Commissioner | City-wide, delegated approval | Executive Overview |
| Deputy Municipal Commissioner — Zone III | Deputy Municipal Commissioner | Zone III wards only | Executive Overview |
| Ward Officer — first ward of the active corporation | Ward Officer | **One ward only** | Ward Intelligence |
| Ward Officer — second ward of the active corporation | Ward Officer | **One ward only** | Ward Intelligence |
| Chief Engineer — Infrastructure Delivery | Chief Engineer | Engineering departments, all wards | Project Intelligence |
| Chief Accountant (Finance) | Finance Officer | Budget, revenue, property, procurement | Budget Intelligence |
| Director — Disaster Management Cell | Disaster Management Officer | Situation Room, monsoon, emergency | Situation Room |
| Executive Health Officer | Executive Health Officer | Health, hospitals, environment | Public Health |
| Chief Internal Auditor | Municipal Auditor | Read-only across decisions, evidence, finance | Evidence & Audit |
| Security Administrator — Information Security Office | Security Administrator | Security, identity, access, audit | Security Command Centre |
| AI Governance Officer | AI Governance Officer | Models, prompts, AI risk, oversight | AI Governance |
| Control Room Operator — Emergency Operations Centre | Control Room Operator | Incidents, alerts, situation room | Situation Room |
| Municipal Analyst — Intelligence Unit | Municipal Analyst | Read + draft, no approval authority | Executive Overview |

Changing role changes the sidebar, the reachable routes, the data returned by every service, and which action controls are enabled.

---

## 5. Security model

### The engine

```ts
canAccess(user, resource, action, context) → { allowed, reason, basis }
```

Evaluated in five ordered stages:

1. **RBAC** — does the role hold `resource:action`?
2. **Classification ceiling** — does the record's classification exceed the role's ceiling?
3. **Ward scope** — is the record inside the principal's authorised wards?
4. **Department scope** — is it inside their authorised departments?
5. **Domain scope** — is the intelligence domain within their remit?

**Resources:** ward · department · project · budget · revenue · procurement · security · ai · ai-governance · evidence · decision · incident · alert · intelligence · action · audit · dataset · connector · platform · administration · situation-room · report

**Actions:** view · create · edit · approve · assign · escalate · export · administer

### Where it is enforced

- **Route guard** — re-evaluated on every navigation, so typing a URL is denied exactly as a hidden link would be.
- **Service layer** — every read filters through `filterByScope`; every mutation checks permission, and records an `access-denied` audit event before throwing.
- **Interface** — unauthorised controls are **disabled with an explanatory tooltip**, not hidden, so the operator understands the constraint.

Hiding a navigation link is a presentation convenience. It is never the control.

### Data classification

`Public · Internal · Confidential · Restricted` — carried on every record, enforced against the role ceiling, and displayed wherever a record is surfaced.

### Multi-tenancy

Every domain entity carries `tenantId`. Every service call is tenant-scoped. `config/municipality.config.ts` derives all deployment-specific configuration from the corporation roster in `config/corporations.ts`, and switching corporation rebuilds every data layer against that corporation's own published reference statistics — see *Multi-corporation deployment* above. Tenant isolation here is a **single-browser demonstration** of the scoping model: one corporation is active at a time and its data is rebuilt in place. Production multi-tenancy — separate stores, separate credentials, separate institutional governance — is *architected*, not claimed as implemented.

---

## 6. AI architecture

### The abstraction

```ts
interface AIProvider {
  generateExecutiveBrief(ctx)
  analyseRisk(ctx, domain?)
  explainMetric(ctx, metricId)
  answerMunicipalQuery(ctx, question)
  recommendActions(ctx, subject)
  summariseIncident(ctx, incident)
  generateDecisionOptions(ctx, decisionCase)
  interpretScenario(ctx, inputs, result)
}
```

`MockMunicipalAIProvider` is the demonstration implementation. It retrieves real structured platform records — scoped by the permission engine *before* generation — and composes deterministic, evidence-cited responses. Swapping in an approved sovereign model, an on-premise deployment, Azure OpenAI or an IndiaAI-ecosystem model behind a governed AI gateway requires implementing this one interface. **No presentation component contains AI logic.**

### Response contract

Every substantive answer carries: **Answer · Key Findings · Evidence · Confidence · Recommended Actions · Risks & Limitations · Sources · Generated At · Data Freshness**, plus a grounding mode of *Evidence-backed response* or *General reasoning*. Confidence is derived from evidence count and record staleness, and the derivation is stated.

### Human-in-the-loop

The gateway blocks a request **before it reaches any model** where it seeks an act reserved to human authority: approving expenditure, sanctioning payment, imposing penalties, approving procurement, rejecting citizen eligibility, amending official records, issuing orders, or characterising anyone's conduct.

AI may: analyse · recommend · forecast · summarise · detect anomalies · prioritise · simulate · explain.
AI may not: decide.

No AI output can transition a workflow state. Every recommendation names an accountable human role and carries `requiresHumanApproval: true`.

---

## 7. Governance model

| Surface | What it holds |
| --- | --- |
| **Evidence & provenance** | Source → Transformation → Metric → Rule/Model → Intelligence → Recommendation → Human Decision → Action → Outcome, for every item |
| **Audit trail** | Immutable-style record: actor, role, action, resource, timestamp, reason, session, classification, outcome |
| **Data lineage** | Source → Ingestion → Validation → Canonical Entity → Derived Metric → Intelligence Engine → Dashboard → Decision, per metric |
| **Privacy** | Dataset register with purpose, classification, retention, sensitivity, allowed roles, sharing status and the minimisation applied |
| **AI governance** | Model registry, prompt registry, AI risk register, human oversight record, AI incident workflow |
| **Access governance** | Role catalogue, permission matrix, and a live permission-engine tester |
| **Integration health** | Connector register — every connector declared as Simulation, Adapter Ready, Not Connected or Review Required. Never "live" |
| **Platform health** | Service availability, pipelines, AI gateway, storage — simulated components explicitly labelled |
| **Platform readiness** | What is implemented here versus what production requires |

### Workflow engine

Reusable state machines drive every status change; components never assign a status field directly.

- **Intelligence** — New → Reviewed → Assigned → In Progress → Resolved → Verified → Closed
- **Decision** — Draft → Under Review → Approved/Rejected → Assigned → Implementing → Verification → Closed
- **Incident** — Detected → Validated → Active → Contained → Resolved → Reviewed
- **Alert** — Open → Acknowledged → Assigned → Escalated → Resolved → Closed
- **Action** — Open → Assigned → In Progress → Blocked → Completed → Verified → Closed

Transitions declare the permission they require and whether a reason is mandatory. Mandatory reasons are written to the audit trail.

---

## 8. Data model

Strongly typed throughout, with no `any`. Principal entities:

`Ward · Zone · Department · Officer · User · Role · Session · Metric · IntelligenceItem · RecommendedAction · EvidenceItem · ProvenanceChain · Alert · NotificationItem · DecisionCase · DecisionAlternative · DecisionOutcome · ActionItem · Incident · ResponseTeam · TimelineEvent · Complaint · ServiceHealth · MunicipalAsset · WorkforceUnit · BudgetLine · RevenueRecord · RevenueAnomaly · PropertySegment · Project · ProjectMilestone · RiskDriver · Contractor · Contract · Reservoir · WaterZone · WaterAsset · SewerageNode · StormWaterDrain · PumpingStation · RainfallObservation · TideWindow · WaterloggingSpot · MonsoonScenarioResult · WardMonsoonReadiness · WasteRoute · WasteFacility · WasteHotspot · RoadSegment · RoadDefect · TrafficCorridor · HealthIndicator · Hospital · EmergencyStation · AirQualityStation · NoiseReading · CoastalSegment · BuildingRecord · BuildingProposal · PlanningIndicator · OutcomeChain · AIRequestRecord · AIModel · PromptTemplate · AIRiskEntry · HumanOversightRecord · AIIncident · AgentWorkflow · AuditEvent · Dataset · LineageGraph · Connector · SecurityEvent · SecurityPosture · AccessPolicy · PlatformService · PipelineJob · GraphNode · GraphEdge`

### Demonstration dataset scale

The figures below are the **Brihanmumbai** deployment. Every count and magnitude is scaled to the active corporation's published population, area, budget or administrative unit count, so a smaller corporation carries a proportionally smaller caseload rather than Brihanmumbai's:

24 wards · 7 zones · 24 departments · 55 officers · 14 principals · 320 evidence records · 130+ intelligence items · 100+ alerts · 64 incidents · 34 decision cases · 96 actions · 620 complaints · 128 projects · 72 contracts · 22 contractors · 420 municipal assets · 96 budget lines · 32 revenue records · 24 revenue anomalies · 120 property segments · 10 water zones · 7 reservoirs · 33 sewerage nodes · 80+ storm-water drains · 18 pumping stations · 24 rainfall stations · 200+ waterlogging locations · 60+ waste routes · 9 waste facilities · 130+ road segments · 300+ road defects · 10 traffic corridors · 168 health indicators · 40 hospitals · 17 emergency stations · 12 coastal segments · 140+ building records · 86 building proposals · 148 AI requests · 6 models · 9 prompt templates · 10 AI risks · 6 agent workflows · 260 audit events · 48 security events · 16 connectors · 14 datasets · 14 lineage graphs · a knowledge graph of several hundred nodes and edges.

**All deterministic.** Every dataset derives from a fixed seed via `mulberry32`; figures never change on re-render or reload. Relative timestamps are anchored to a fixed reference instant so freshness statements stay internally consistent.

---

## 9. API integration approach

The demonstration services are the seam. To connect a real departmental system:

1. Implement the same method signature in `src/services/<domain>.service.ts` against the real transport.
2. Keep returning the same domain model from `src/types/*`.
3. Register the connector in the connector register with its true health state.
4. Nothing above the service layer changes — no hook, no component, no page.

Adapters are architected for REST, GraphQL, WebSocket, Server-Sent Events, GIS services, event streams, document intelligence, an AI gateway, IoT telemetry and CCTV metadata. `.env.example` documents every configuration point. **No integration is claimed as live in this build.**

---

## 10. Deployment notes

The architecture is compatible in principle with public cloud, Indian cloud, government cloud, private cloud, sovereign environments, on-premise and hybrid deployment. The build output is a static single-page application plus whatever backend the service layer is pointed at.

No infrastructure automation is included, and no hosting decision is asserted.

---

## 11. Current limitations

This is a **demonstration environment**. Specifically:

- No connection to any municipal, state or third-party system exists.
- All data is modelled. Figures are plausible, not actual.
- **Persistence is partial.** A MongoDB persistence layer exists for one
  vertical slice — users, wards, complaints and the audit trail — behind the
  API server in `server/`. It is active only when `VITE_API_BASE_URL` is set;
  with it empty, the platform runs entirely in memory as before. See
  [`server/README.md`](server/README.md). Workflow state, and every collection
  outside that slice, is still held in session and does not survive a reload.
- **Authentication differs by mode.** Without the API it is profile selection
  with no credential, token or session security whatsoever. With the API, a
  server-signed `httpOnly` session cookie establishes the principal and the
  permission engine runs server-side — but the gate is still a single shared
  passphrase with no per-officer credential, no rotation and no MFA. Neither
  mode is an institutional identity control.
- **The audit trail is tamper-evident, not tamper-proof.** When persisted, each
  entry carries a digest over its own content and the previous entry's digest,
  and `npm run db:verify` walks the chain. Anyone holding the database
  credential could recompute the whole chain; preventing that needs an
  append-only store outside the application's own credentials, which is not
  built.
- The AI layer is a deterministic local provider. No model endpoint is contacted.
- Scenario engines are deterministic rule models labelled **Simulation — not forecast**. They are not calibrated forecasts.
- Spatial geometry is illustrative and generated. It is **not** official GIS boundary data.
- Health data is aggregate-only by construction. No patient-level information is modelled anywhere.
- No security assessment, privacy review or certification has been performed.

The in-application **Platform Readiness** page states this in the interface itself, because institutional credibility depends on being explicit about it.

---

## 12. Production hardening roadmap

Recommended sequence for a production deployment:

1. **Institutional agreements** — data-sharing agreements per department; purpose and retention agreed and recorded.
2. **Identity** — production identity provider, enforced MFA, privileged access management, session policy.
3. **Integrations, in dependency order** — grievance platform → property tax and finance → project and contract management → water, roads and solid waste operations → GIS → hospitals and health surveillance → disaster management and weather → IoT telemetry.
4. **Persistence** — production database, append-only audit store, object storage, backup and disaster recovery with tested restore.
5. **Security** — encryption key management, SIEM/SOC integration, vulnerability management, independent security assessment and penetration test.
6. **Privacy** — privacy impact assessment, minimisation verification at every connector boundary, retention enforcement.
7. **AI governance** — model selection and evaluation, prompt approval, red-teaming for prompt injection and unsafe recommendation, human oversight sampling, AI incident procedure.
8. **Operations** — standard operating procedures, escalation matrices, control room staffing model, training, and a service management function.
9. **Assurance** — outcome measurement baseline agreed with departments before go-live, so effectiveness can be reported honestly.

---

## 13. Non-negotiable product principles

> Trust before automation.
> Evidence before recommendation.
> Human authority before AI authority.
> Source systems remain authoritative.
> Sensitive information follows least privilege.
> AI outputs must communicate uncertainty.
> Simulation must never be represented as fact.
> Anomaly does not mean fraud.
> Risk does not mean guilt.
> Correlation does not mean causation.
> Dashboards must lead to workflows.
> Workflows must lead to accountable actions.
> Actions must lead to measurable outcomes.
> Decisions must remain auditable.

---

*Maha AI — Urban Intelligence Infrastructure · BMC Intelligence Infrastructure · Demonstration Environment*
