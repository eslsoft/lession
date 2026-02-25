import React, { useState } from 'react'
import { Plus, Scissors, Trash2, Play, Upload } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Progress } from '../../components/ui/progress'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { ConfirmDialog } from './ConfirmDialog'
import { statusColors, publishColors, formatDuration } from './constants'
import type { Episode } from '../../../shared/types'

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
  onBatchPublish: (ids: string[], targetStatus: 'preview' | 'published') => Promise<void>
  onBatchDelete: (ids: string[]) => Promise<void>
  onNewEpisode: () => void
  onSplitImport: () => void
}

export function EpisodeTable({
  episodes,
  loading,
  progresses,
  batchPublishProgress,
  onEpisodeClick,
  onDeleteEpisode,
  onBatchPublish,
  onBatchDelete,
  onNewEpisode,
  onSplitImport,
}: EpisodeTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [epToDelete, setEpToDelete] = useState<Episode | null>(null)
  const [showBatchDelete, setShowBatchDelete] = useState(false)
  const [batchPublishing, setBatchPublishing] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)

  const toggleSelect = (episodeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(episodeId)) next.delete(episodeId)
      else next.add(episodeId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === episodes.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(episodes.map((ep) => ep.id)))
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
        <h2 className="text-lg font-semibold">Episodes ({episodes.length})</h2>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground self-center">
                {selectedIds.size} selected
              </span>
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
          <Button variant="outline" onClick={onSplitImport}>
            <Scissors className="h-4 w-4 mr-2" />
            Split & Import
          </Button>
          <Button onClick={onNewEpisode}>
            <Plus className="h-4 w-4 mr-2" />
            New Episode
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading && episodes.length === 0 ? (
        <div className="text-muted-foreground">Loading episodes...</div>
      ) : episodes.length === 0 ? (
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
                  checked={episodes.length > 0 && selectedIds.size === episodes.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < episodes.length
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
            {episodes.map((ep) => (
              <TableRow
                key={ep.id}
                className="cursor-pointer"
                onClick={() => onEpisodeClick(ep.id)}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                    checked={selectedIds.has(ep.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(ep.id)}
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
