import { useRef, useState } from 'react'
import { CheckCircle2, Trash2, UploadCloud } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, MetricGrid } from '@/components/ui/primitives'
import { DemonstrationNotice, EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { GovPanel } from '@/components/gov/GovPanel'
import { MetricCard } from '@/components/cards'
import { useServiceAction, useServiceQuery } from '@/hooks'
import { queryKeys } from '@/app/queryClient'
import { pilotService, type PilotDataset } from '@/services'
import { usePageMasthead } from '@/stores/masthead.store'
import { formatDateTime, formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * src/pages/admin/PilotDataIngestionPage.tsx
 *
 * The one connector in this platform that is not deterministic demo data.
 * Everywhere else, "Connector" means a registered intent to integrate - see
 * `src/data/governance.data.ts`, where every connector's `notes` field
 * states plainly that nothing here is wired to a live departmental system.
 * This page is the exception, and it exists to make one specific claim
 * demonstrable rather than asserted: a CSV export of the kind an officer
 * could actually pull from the real Property Tax Citizen Portal is uploaded
 * here, parsed by a small dev-server backend (`scripts/pilot-api-plugin.ts`),
 * and the rows below are exactly what that file contained - not a generated
 * figure standing in for one.
 *
 * It stays a single narrow pilot on purpose. Proving the ingestion path is
 * real does not require standing up production infrastructure for every
 * connector in the register at once.
 */

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function PilotDataIngestionPage(): React.JSX.Element {
  usePageMasthead(t('Pilot Data Ingestion'))

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const datasetQuery = useServiceQuery(queryKeys.pilotRevenue(), (u) => pilotService.get(u))
  const doUpload = useServiceAction((u, filename: string, content: string) => pilotService.upload(u, filename, content), [
    queryKeys.pilotRevenue(),
  ])
  const doClear = useServiceAction((u) => pilotService.clear(u), [queryKeys.pilotRevenue()])

  async function handleFileChosen(file: File): Promise<void> {
    setUploadError(null)
    setPendingFile({ name: file.name, size: file.size })
    setUploading(true)
    try {
      const content = await file.text()
      await doUpload(file.name, content)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('The file could not be ingested.'))
    } finally {
      setUploading(false)
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (datasetQuery.isLoading) return <LoadingState variant="table" />
  if (datasetQuery.error) {
    return <ErrorState detail={datasetQuery.error.message} onRetry={() => datasetQuery.refetch()} />
  }

  const dataset: PilotDataset | null = datasetQuery.data ?? null

  const columns: Array<Column<Record<string, string>>> = (dataset?.columns ?? []).map((col) => ({
    id: col,
    header: col,
    cell: (row) => row[col] ?? '',
    sortValue: (row) => row[col] ?? '',
    searchValue: (row) => row[col] ?? '',
  }))

  return (
    <PageBody>
      <PageHeader
        eyebrow={t('Administration')}
        breadcrumbs={[{ label: t('Administration') }, { label: t('Pilot Data Ingestion') }]}
      />

      <div className="rounded-[2px] border border-google-blue-100 bg-google-blue-50 px-4 py-3 text-xs leading-relaxed text-ink-700">
        {t('Every other page in this platform reads deterministic demonstration data. This one page is the exception: upload a CSV export of the kind an officer could pull from the real Property Tax Citizen Portal, and the register below shows exactly what that file contained.')}
      </div>

      {dataset ? (
        <MetricGrid columns={3}>
          <MetricCard
            label={t('Rows ingested')}
            value={formatNumber(dataset.rows.length)}
            icon={<CheckCircle2 className="h-4 w-4" />}
            background="green"
          />
          <MetricCard label={t('Columns detected')} value={formatNumber(dataset.columns.length)} background="amber" />
          <MetricCard label={t('Uploaded')} value={formatDateTime(dataset.uploadedAt)} support={dataset.sourceFilename} background="red" />
        </MetricGrid>
      ) : null}

      <GovPanel title={t('Upload a real export')} tone="amber">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-xs leading-relaxed text-ink-600">
            {t('Accepts a plain CSV with a header row. Anything already ingested is replaced, not merged.')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFileChosen(file)
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<UploadCloud className="h-3.5 w-3.5" />}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? t('Ingesting…') : t('Choose CSV file')}
            </Button>
            {dataset ? (
              <Button
                variant="outline"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => void doClear()}
              >
                {t('Clear pilot data')}
              </Button>
            ) : null}
            {pendingFile ? (
              <span className="text-xs text-ink-500">
                {pendingFile.name} · {fileSizeLabel(pendingFile.size)}
              </span>
            ) : null}
          </div>
          {uploadError ? (
            <p className="text-xs font-medium text-crit-700">{uploadError}</p>
          ) : null}
        </div>
      </GovPanel>

      {dataset ? (
        <GovPanel title={t('Ingested rows')} tone="green" dense>
          <div className="px-4 pb-4">
            <DataTable
              rows={dataset.rows}
              columns={columns}
              rowKey={(row) => Object.values(row).join('|')}
              searchable
              pageSize={25}
            />
          </div>
        </GovPanel>
      ) : (
        <Card>
          <EmptyState
            title={t('No pilot data ingested yet')}
            detail={t('Upload a CSV above to see real, uploaded figures rendered here instead of demonstration data.')}
            compact
          />
        </Card>
      )}

      <DemonstrationNotice />
    </PageBody>
  )
}

export default PilotDataIngestionPage
