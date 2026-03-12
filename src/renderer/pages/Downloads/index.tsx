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
    cancelDownload,
    retryDownload,
    updateProgress,
  } = useDownloadStore()
  const { series, fetchSeries } = useSeriesStore()

  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDownload, setImportDownload] = useState<Download | null>(null)
  const [importSeriesId, setImportSeriesId] = useState('')

  useEffect(() => {
    fetchDownloads()
    fetchSeries()
  }, [fetchDownloads, fetchSeries])

  useEffect(() => {
    const unsubscribe = window.electronAPI.download.onProgress((id, progress) => {
      updateProgress(id, progress)
      if (progress >= 100) {
        fetchDownloads()
      }
    })
    return unsubscribe
  }, [updateProgress, fetchDownloads])

  const handleStartDownload = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await startDownload(trimmed)
      setUrl('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStartDownload()
    }
  }

  const handleDelete = async (id: string) => {
    await cancelDownload(id)
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Downloads</h1>

      {/* URL Input Bar */}
      <div className="flex gap-2 mb-6">
        <Input
          className="flex-1"
          placeholder="Paste video URL here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
        />
        <Button onClick={handleStartDownload} disabled={submitting || !url.trim()}>
          Download
        </Button>
      </div>

      {/* Download List */}
      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No downloads yet. Paste a URL above to start downloading.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Title / URL</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
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
                  {dl.status === 'downloading' ? (
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Progress value={dl.progress} className="flex-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {Math.round(dl.progress)}%
                      </span>
                    </div>
                  ) : dl.status === 'done' ? (
                    <span className="text-xs text-muted-foreground">100%</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{formatDuration(dl.duration)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {dl.status === 'downloading' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelDownload(dl.id)}
                      >
                        Cancel
                      </Button>
                    )}
                    {dl.status === 'done' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openImportDialog(dl)}
                      >
                        Import as Episode
                      </Button>
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
                          onClick={() => handleDelete(dl.id)}
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
