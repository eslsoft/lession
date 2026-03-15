import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Play, Upload, AudioLines } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Progress } from '../../components/ui/progress'
import { Select } from '../../components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { ConfirmDialog } from './ConfirmDialog'
import { statusColors, publishColors, formatDuration } from './constants'
import type { Episode, BookImport, PublishStatus } from '../../../shared/types'

type PublishFilter = 'all' | PublishStatus

interface TranscriptionProgress {
  stage: string
  percent: number
}

interface EpisodeTableProps {
  episodes: Episode[]
  loading: boolean
  progresses: Record<string, TranscriptionProgress>
  batchPublishProgress: { current: number; total: number } | null
  onEpisodeClick: (episodeId: string) => void
  onDeleteEpisode: (id: string) => Promise<void>
  transcriptionServices: { id: string; name: string; provider: string }[]
  onBatchTranscribe: (ids: string[], serviceId: string) => Promise<void>
  onBatchPublish: (ids: string[], targetStatus: 'preview' | 'published') => Promise<void>
  onBatchDelete: (ids: string[]) => Promise<void>
  onNewEpisode: () => void
  activeBookImport: BookImport | null
}

export function EpisodeTable({
  episodes,
  loading,
  progresses,
  batchPublishProgress,
  onEpisodeClick,
  onDeleteEpisode,
  transcriptionServices,
  onBatchTranscribe,
  onBatchPublish,
  onBatchDelete,
  onNewEpisode,
  activeBookImport,
}: EpisodeTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [epToDelete, setEpToDelete] = useState<Episode | null>(null)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [transcriptionServiceId, setTranscriptionServiceId] = useState(transcriptionServices[0]?.id ?? '')
  const [batchTranscribing, setBatchTranscribing] = useState(false)
  const [batchPublishing, setBatchPublishing] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [publishFilter, setPublishFilter] = useState<PublishFilter>('all')

  const filteredEpisodes = useMemo(
    () => publishFilter === 'all' ? episodes : episodes.filter((ep) => ep.publishStatus === publishFilter),
    [episodes, publishFilter],
  )

  const toggleSelect = (episodeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(episodeId)) next.delete(episodeId)
      else next.add(episodeId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEpisodes.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredEpisodes.map((ep) => ep.id)))
    }
  }

  const handleConfirmDeleteEpisode = async () => {
    if (!epToDelete) return
    await onDeleteEpisode(epToDelete.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(epToDelete.id)
      return next
    })
    setEpToDelete(null)
  }

  const handleBatchTranscribe = async () => {
    if (!transcriptionServiceId) return
    setBatchTranscribing(true)
    try {
      await onBatchTranscribe(Array.from(selectedIds), transcriptionServiceId)
      setSelectedIds(new Set())
    } finally {
      setBatchTranscribing(false)
    }
  }

  const handleBatchPublish = async (targetStatus: 'preview' | 'published') => {
    setBatchPublishing(true)
    try {
      await onBatchPublish(Array.from(selectedIds), targetStatus)
      setSelectedIds(new Set())
    } finally {
      setBatchPublishing(false)
    }
  }

  const handleBatchDelete = async () => {
    setBatchDeleting(true)
    try {
      await onBatchDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setBatchDeleting(false)
      setShowBatchDelete(false)
    }
  }

  return (
    <>
      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Episodes ({filteredEpisodes.length})</h2>
          <div className="flex items-center rounded-md border border-input bg-muted/30 p-0.5">
            {([['all', 'All'], ['draft', 'Draft'], ['preview', 'Preview'], ['published', 'Published']] as const).map(([value, label]) => (
              <button
                key={value}
                className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                  publishFilter === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setPublishFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground self-center">
                {selectedIds.size} selected
              </span>
              {transcriptionServices.length > 0 && (
                <>
                  {transcriptionServices.length > 1 && (
                    <Select
                      value={transcriptionServiceId}
                      onChange={(e) => setTranscriptionServiceId(e.target.value)}
                      options={transcriptionServices.map((s) => ({ value: s.id, label: `${s.name} (${s.provider})` }))}
                      className="w-40 h-8 text-xs"
                    />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batchTranscribing || !transcriptionServiceId}
                    onClick={handleBatchTranscribe}
                  >
                    <AudioLines className="h-4 w-4 mr-2" />
                    Transcribe
                  </Button>
                </>
              )}
              {batchPublishProgress ? (
                <div className="flex items-center gap-2 self-center">
                  <Progress value={(batchPublishProgress.current / batchPublishProgress.total) * 100} className="w-32 h-2" />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Publishing {batchPublishProgress.current}/{batchPublishProgress.total}
                  </span>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={batchPublishing}
                  onClick={() => handleBatchPublish('published')}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Publish
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                disabled={batchDeleting}
                onClick={() => setShowBatchDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
          <Button onClick={onNewEpisode}>
            <Plus className="h-4 w-4 mr-2" />
            New Episode
          </Button>
        </div>
      </div>

      {/* Book Import Progress */}
      {activeBookImport && activeBookImport.status !== 'done' && activeBookImport.status !== 'cancelled' && (
        <div className="mb-4 rounded-lg border bg-purple-500/5 border-purple-500/20 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-purple-400">
              {activeBookImport.status === 'pending' && 'Preparing book import...'}
              {activeBookImport.status === 'extracting' && 'Extracting chapters...'}
              {activeBookImport.status === 'generating' && `Generating audio: ${activeBookImport.completedChapters}/${activeBookImport.totalChapters} chapters`}
              {activeBookImport.status === 'error' && `Import error: ${activeBookImport.lastError}`}
            </span>
            {(activeBookImport.status === 'generating' || activeBookImport.status === 'extracting') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.electronAPI.bookImport.cancel(activeBookImport.id)}
              >
                Cancel
              </Button>
            )}
            {activeBookImport.status === 'error' && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.electronAPI.bookImport.retry(activeBookImport.id)}
              >
                Retry
              </Button>
            )}
          </div>
          {activeBookImport.totalChapters > 0 && (
            <Progress
              value={(activeBookImport.completedChapters / activeBookImport.totalChapters) * 100}
              className="h-1.5"
            />
          )}
        </div>
      )}

      {/* Table */}
      {loading && filteredEpisodes.length === 0 ? (
        <div className="text-muted-foreground">Loading episodes...</div>
      ) : filteredEpisodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Play className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No episodes yet. Create one or use Split & Import.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  checked={filteredEpisodes.length > 0 && selectedIds.size === filteredEpisodes.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredEpisodes.length
                  }}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-24">Duration</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Publish</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEpisodes.map((ep) => (
              <TableRow
                key={ep.id}
                className="cursor-pointer"
                onClick={() => onEpisodeClick(ep.id)}
              >
                <TableCell
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelect(ep.id)
                  }}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer pointer-events-none"
                    checked={selectedIds.has(ep.id)}
                    readOnly
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">{ep.order + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{ep.title}</div>
                  {ep.lastError && (
                    <div className="text-xs text-destructive mt-0.5 truncate max-w-xs">{ep.lastError.message}</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDuration(ep.duration)}</TableCell>
                <TableCell>
                  {progresses[ep.id] ? (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        {progresses[ep.id].stage === 'converting' && 'Converting to M4A...'}
                        {progresses[ep.id].stage === 'generating' && 'Generating audio...'}
                        {progresses[ep.id].stage === 'transcribing' && 'Transcribing...'}
                        {progresses[ep.id].stage === 'nlp' && 'NLP processing...'}
                        {!progresses[ep.id].stage && 'Starting...'}
                      </span>
                      <Progress value={progresses[ep.id].percent} className="h-1.5" />
                    </div>
                  ) : (
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[ep.status] ?? ''}`}>
                      {ep.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${publishColors[ep.publishStatus] ?? ''}`}>
                    {ep.publishStatus}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEpToDelete(ep)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Single Episode Delete Confirmation */}
      <ConfirmDialog
        open={!!epToDelete}
        onOpenChange={(open) => { if (!open) setEpToDelete(null) }}
        title="Delete Episode"
        description={`Are you sure you want to delete "${epToDelete?.title}"? This action cannot be undone.`}
        onConfirm={handleConfirmDeleteEpisode}
      />

      {/* Batch Delete Confirmation */}
      <ConfirmDialog
        open={showBatchDelete}
        onOpenChange={setShowBatchDelete}
        title={`Delete ${selectedIds.size} Episodes`}
        description={`Are you sure you want to delete ${selectedIds.size} selected episode${selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.`}
        loading={batchDeleting}
        onConfirm={handleBatchDelete}
      />
    </>
  )
}
