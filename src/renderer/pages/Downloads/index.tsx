import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore } from '../../stores/downloadStore'
import { useSeriesStore } from '../../stores/seriesStore'
import type { Download } from '../../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { Progress } from '../../components/ui/progress'
import { Tooltip } from '../../components/ui/tooltip'
import { Select } from '../../components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'

function formatDuration(seconds?: number): string {
  if (!seconds) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function StatusBadge({ status }: { status: Download['status'] }) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>
    case 'downloading':
      return <Badge variant="default">Downloading</Badge>
    case 'converting':
      return <Badge variant="default" className="bg-orange-500">Converting</Badge>
    case 'paused':
      return <Badge variant="secondary" className="border-yellow-500 text-yellow-500">Paused</Badge>
    case 'done':
      return <Badge variant="outline" className="border-green-500 text-green-500">Done</Badge>
    case 'error':
      return <Badge variant="destructive">Error</Badge>
  }
}

export default function DownloadsPage() {
  const navigate = useNavigate()
  const {
    downloads,
    fetchDownloads,
    startDownload,
    startBatchDownload,
    cancelDownload,
    pauseDownload,
    resumeDownload,
    retryDownload,
    deleteDownload,
    clearCompleted,
    retryAllFailed,
    openFile,
    showInFolder,
    updateProgress,
  } = useDownloadStore()
  const { series, fetchSeries } = useSeriesStore()

  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [batchMode, setBatchMode] = useState(false)

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDownload, setImportDownload] = useState<Download | null>(null)
  const [importSeriesId, setImportSeriesId] = useState('')

  useEffect(() => {
    fetchDownloads()
    fetchSeries()
  }, [fetchDownloads, fetchSeries])

  useEffect(() => {
    const unsubscribe = window.electronAPI.download.onProgress((info) => {
      updateProgress(info)
    })
    return unsubscribe
  }, [updateProgress])

  const handleStartDownload = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      if (batchMode) {
        const urls = trimmed.split('\n').map(u => u.trim()).filter(Boolean)
        if (urls.length > 0) {
          await startBatchDownload(urls)
        }
      } else {
        await startDownload(trimmed)
      }
      setUrl('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !batchMode) {
      handleStartDownload()
    }
  }

  const openImportDialog = (dl: Download) => {
    setImportDownload(dl)
    setImportSeriesId(series[0]?.id ?? '')
    setImportDialogOpen(true)
  }

  const handleImport = () => {
    if (!importDownload || !importSeriesId) return
    const filePath = importDownload.localPath ?? ''
    navigate(`/series/${importSeriesId}/import-audio?file=${encodeURIComponent(filePath)}&seriesId=${importSeriesId}`)
    setImportDialogOpen(false)
    setImportDownload(null)
  }

  const sorted = [...downloads].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const seriesOptions = series.map((s) => ({ value: s.id, label: s.title }))

  const hasCompleted = downloads.some((d) => d.status === 'done')
  const hasFailed = downloads.some((d) => d.status === 'error')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Downloads</h1>

      {/* URL Input Bar */}
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex gap-2">
          {batchMode ? (
            <textarea
              className="flex-1 min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Paste one URL per line..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
            />
          ) : (
            <Input
              className="flex-1"
              placeholder="Paste video URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={submitting}
            />
          )}
          <div className="flex flex-col gap-1">
            <Button onClick={handleStartDownload} disabled={submitting || !url.trim()}>
              {batchMode ? 'Download All' : 'Download'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setBatchMode(!batchMode); setUrl('') }}
              className="text-xs"
            >
              {batchMode ? 'Single URL' : 'Batch Mode'}
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {(hasCompleted || hasFailed) && (
        <div className="flex gap-2 mb-4">
          {hasCompleted && (
            <Button variant="outline" size="sm" onClick={clearCompleted}>
              Clear Completed
            </Button>
          )}
          {hasFailed && (
            <Button variant="outline" size="sm" onClick={retryAllFailed}>
              Retry All Failed
            </Button>
          )}
        </div>
      )}

      {/* Download List */}
      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No downloads yet. Paste a URL above to start downloading.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Title / URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((dl) => (
              <TableRow key={dl.id}>
                <TableCell className="font-medium max-w-0">
                  <div className="truncate" title={dl.url}>
                    {dl.title || dl.url}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={dl.status} />
                </TableCell>
                <TableCell>
                  <div className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <Progress value={dl.progress} className="flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap w-[36px] text-right">
                        {Math.round(dl.progress)}%
                      </span>
                    </div>
                    <div className="flex gap-2 mt-0.5 h-4">
                      {dl.status === 'downloading' && (
                        <>
                          <span className="text-xs text-muted-foreground whitespace-nowrap w-[80px]">
                            {dl.speed || ''}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {dl.eta ? `ETA ${dl.eta}` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{dl.fileSize || '--'}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatDuration(dl.duration)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {(dl.status === 'downloading' || dl.status === 'converting') && (
                      <>
                        {dl.status === 'downloading' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => pauseDownload(dl.id)}
                          >
                            Pause
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelDownload(dl.id)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {dl.status === 'pending' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pauseDownload(dl.id)}
                        >
                          Pause
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelDownload(dl.id)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {dl.status === 'paused' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resumeDownload(dl.id)}
                        >
                          Resume
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteDownload(dl.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {dl.status === 'done' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openFile(dl.id)}
                        >
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => showInFolder(dl.id)}
                        >
                          Folder
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openImportDialog(dl)}
                        >
                          Import
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteDownload(dl.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {dl.status === 'error' && (
                      <>
                        <Tooltip content={dl.lastError || 'Unknown error'}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryDownload(dl.id)}
                          >
                            Retry
                          </Button>
                        </Tooltip>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteDownload(dl.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Import Dialog — select target series */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent onClose={() => setImportDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Import as Episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import "{importDownload?.title || importDownload?.filename}" — you can choose to create a single episode or split into multiple on the next page.
            </p>
            <div>
              <label className="text-sm font-medium mb-1 block">Target Series</label>
              {seriesOptions.length > 0 ? (
                <Select
                  options={seriesOptions}
                  value={importSeriesId}
                  onChange={(e) => setImportSeriesId(e.target.value)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No series available. Create a series first.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importSeriesId}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
