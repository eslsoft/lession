import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore } from '@renderer/stores/downloadStore'
import { useSeriesStore } from '@renderer/stores/seriesStore'
import type { Download } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Download as DownloadIcon,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownToLine,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { STATUS_FILTER_OPTIONS, type StatusFilter } from './utils'
import DownloadItem from './DownloadItem'
import NewDownloadDialog from './NewDownloadDialog'
import ImportDialog from './ImportDialog'
import DeleteConfirmDialog from './DeleteConfirmDialog'

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

  // Filters
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // New download dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // Delete confirm dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

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

  const handleNewDownload = async (urls: string[]) => {
    if (urls.length === 1) {
      await startDownload(urls[0])
    } else {
      await startBatchDownload(urls)
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

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(async (deleteFiles: boolean) => {
    if (deleteTargetId) {
      await deleteDownload(deleteTargetId, deleteFiles)
    }
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
  }, [deleteTargetId, deleteDownload])

  const handleClearConfirm = useCallback(async (deleteFiles: boolean) => {
    await clearCompleted(deleteFiles)
    setClearDialogOpen(false)
  }, [clearCompleted])

  // Filter & sort
  const filtered = useMemo(() => {
    let list = downloads
    if (statusFilter !== 'all') {
      list = list.filter(d => d.status === statusFilter)
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      list = list.filter(d =>
        (d.title && d.title.toLowerCase().includes(kw)) ||
        (d.filename && d.filename.toLowerCase().includes(kw)) ||
        d.url.toLowerCase().includes(kw)
      )
    }
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [downloads, statusFilter, keyword])

  const seriesOptions = series.map((s) => ({ value: s.id, label: s.title }))

  // Stats
  const stats = useMemo(() => {
    const active = downloads.filter(d => d.status === 'downloading' || d.status === 'converting').length
    const queued = downloads.filter(d => d.status === 'pending').length
    const paused = downloads.filter(d => d.status === 'paused').length
    const completed = downloads.filter(d => d.status === 'done').length
    const failed = downloads.filter(d => d.status === 'error').length
    return { active, queued, paused, completed, failed, total: downloads.length }
  }, [downloads])

  const statusFilterOptions = STATUS_FILTER_OPTIONS.map(o => ({ value: o.value, label: o.label }))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 space-y-3 mb-4">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Downloads</h1>
          <div className="flex items-center gap-2">
            {stats.completed > 0 && (
              <Button variant="outline" size="sm" onClick={() => setClearDialogOpen(true)}>
                Clear Completed
              </Button>
            )}
            {stats.failed > 0 && (
              <Button variant="outline" size="sm" onClick={retryAllFailed}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Retry All Failed
              </Button>
            )}
            <Button size="sm" onClick={() => setNewDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Download
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search by title or URL..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setKeyword('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select
            className="w-[140px] flex-shrink-0"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          />
        </div>

        {/* Stats bar */}
        {stats.total > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{stats.total} total</span>
            {stats.active > 0 && (
              <span className="flex items-center gap-1 text-blue-500">
                <ArrowDownToLine className="h-3 w-3" />
                {stats.active} active
              </span>
            )}
            {stats.queued > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {stats.queued} queued
              </span>
            )}
            {stats.paused > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <Pause className="h-3 w-3" />
                {stats.paused} paused
              </span>
            )}
            {stats.completed > 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <CheckCircle2 className="h-3 w-3" />
                {stats.completed} completed
              </span>
            )}
            {stats.failed > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" />
                {stats.failed} failed
              </span>
            )}
            {filtered.length !== stats.total && (
              <span className="ml-auto">{filtered.length} shown</span>
            )}
          </div>
        )}
      </div>

      {/* Download list */}
      <div className="flex-1 min-h-0">
        {downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <DownloadIcon className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm">No downloads yet</p>
            <p className="text-xs mt-1">Click "New Download" to get started</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Search className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">No matching downloads</p>
            <p className="text-xs mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 pb-4">
              {filtered.map((dl) => (
                <DownloadItem
                  key={dl.id}
                  dl={dl}
                  onPause={() => pauseDownload(dl.id)}
                  onResume={() => resumeDownload(dl.id)}
                  onCancel={() => cancelDownload(dl.id)}
                  onRetry={() => retryDownload(dl.id)}
                  onDelete={() => handleDeleteClick(dl.id)}
                  onOpen={() => openFile(dl.id)}
                  onShowInFolder={() => showInFolder(dl.id)}
                  onImport={() => openImportDialog(dl)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* New Download Dialog */}
      <NewDownloadDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSubmit={handleNewDownload}
      />

      {/* Import Dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        download={importDownload}
        seriesOptions={seriesOptions}
        seriesId={importSeriesId}
        onSeriesChange={setImportSeriesId}
        onImport={handleImport}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="删除下载记录"
        description="确定要删除这条下载记录吗？"
        confirmLabel="删除"
        onConfirm={handleDeleteConfirm}
      />

      {/* Clear Completed Confirm Dialog */}
      <DeleteConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="清除已完成的下载"
        description={`确定要清除所有已完成的下载记录吗？（共 ${stats.completed} 条）`}
        confirmLabel="清除"
        onConfirm={handleClearConfirm}
      />
    </div>
  )
}
