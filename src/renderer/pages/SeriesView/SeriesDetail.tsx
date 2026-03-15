import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSeriesStore } from '../../stores/seriesStore'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useConfigStore } from '../../stores/configStore'
import { useTranscriptionStore } from '../../stores/transcriptionStore'
import { MEDIA_FILE_FILTER, IMAGE_FILE_FILTER } from '@shared/media-formats'
import type { BookImport } from '@shared/types'
import { Separator } from '../../components/ui/separator'
import { SeriesHeader } from './SeriesHeader'
import { EditSeriesDialog } from './EditSeriesDialog'
import { CreateEpisodeDialog, type CreationMethod } from './CreateEpisodeDialog'
import { EpisodeTable } from './EpisodeTable'
import { ConfirmDialog } from './ConfirmDialog'

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { series, fetchSeries, updateSeries, deleteSeries, uploadCover } = useSeriesStore()
  const { episodes, loading: episodesLoading, fetchEpisodes, deleteEpisode } = useEpisodeStore()
  const { config } = useConfigStore()
  const progresses = useTranscriptionStore((s) => s.progresses)
  const completedIds = useTranscriptionStore((s) => s.completedIds)
  const ackCompleted = useTranscriptionStore((s) => s.ackCompleted)

  const currentSeries = series.find((s) => s.id === id)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [batchPublishProgress, setBatchPublishProgress] = useState<{ current: number; total: number } | null>(null)
  const [activeBookImport, setActiveBookImport] = useState<BookImport | null>(null)

  useEffect(() => {
    if (!currentSeries) fetchSeries()
  }, [currentSeries, fetchSeries])

  useEffect(() => {
    if (id) fetchEpisodes(id)
  }, [id, fetchEpisodes])

  // Subscribe to book import progress
  useEffect(() => {
    const unsub = window.electronAPI.bookImport.onProgress((data) => {
      if (data.seriesId !== id) return
      setActiveBookImport(data)
      if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
        if (id) fetchEpisodes(id)
      }
    })
    return unsub
  }, [id, fetchEpisodes])

  // When any episode in this series finishes transcription, ack + refetch
  useEffect(() => {
    if (!id || completedIds.length === 0) return
    const seriesEpIds = new Set(episodes.map((ep) => ep.id))
    const matched = completedIds.filter((cid) => seriesEpIds.has(cid))
    if (matched.length === 0) return
    matched.forEach(ackCompleted)
    fetchEpisodes(id)
  }, [completedIds, id, episodes, ackCompleted, fetchEpisodes])

  if (!currentSeries) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const handleDeleteSeries = async () => {
    if (!id) return
    await deleteSeries(id)
    navigate('/series')
  }

  const handleUploadCover = async () => {
    if (!id) return
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [IMAGE_FILE_FILTER],
    })
    if (!filePath) return
    await uploadCover(id, filePath)
  }

  const handleCreationMethod = async (method: CreationMethod) => {
    if (!id) return

    switch (method) {
      case 'file': {
        const filePath = await window.electronAPI.dialog.openFile({
          filters: [MEDIA_FILE_FILTER],
        })
        if (!filePath) return
        navigate(`/series/${id}/import-audio?file=${encodeURIComponent(filePath)}&seriesId=${id}&mode=single`)
        break
      }
      case 'split': {
        const filePath = await window.electronAPI.dialog.openFile({
          filters: [MEDIA_FILE_FILTER],
        })
        if (!filePath) return
        navigate(`/series/${id}/import-audio?file=${encodeURIComponent(filePath)}&seriesId=${id}&mode=split`)
        break
      }
      case 'book':
      case 'text':
        navigate(`/series/${id}/tts${method === 'book' ? '?tab=book' : ''}`)
        break
    }
  }

  const transcriptionServices = config?.services?.filter((s) => s.category === 'transcription') ?? []

  const handleBatchTranscribe = async (ids: string[], serviceId: string) => {
    const inProgressStatuses = new Set(['converting', 'generating', 'transcribing'])
    const eligibleIds = ids.filter((epId) => {
      const ep = episodes.find((e) => e.id === epId)
      return ep && !inProgressStatuses.has(ep.status)
    })
    if (eligibleIds.length === 0) return
    const errors: { title: string; error: string }[] = []
    for (const epId of eligibleIds) {
      try {
        await window.electronAPI.transcript.generate(epId, serviceId)
      } catch (err) {
        const ep = episodes.find((e) => e.id === epId)
        errors.push({
          title: ep?.title ?? epId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (id) await fetchEpisodes(id)
    if (errors.length > 0) {
      const detail = errors.map((e) => `• ${e.title}: ${e.error}`).join('\n')
      window.alert(`${errors.length} episode(s) failed to transcribe:\n\n${detail}`)
    }
  }

  const handleBatchPublish = async (ids: string[], targetStatus: 'preview' | 'published') => {
    const publishableIds = ids.filter((epId) => {
      const ep = episodes.find((e) => e.id === epId)
      return ep && ep.status === 'transcribed'
    })
    if (publishableIds.length === 0) return
    setBatchPublishProgress({ current: 0, total: publishableIds.length })
    const errors: { title: string; error: string }[] = []
    try {
      for (let i = 0; i < publishableIds.length; i++) {
        setBatchPublishProgress({ current: i + 1, total: publishableIds.length })
        try {
          await window.electronAPI.publisher.publishEpisode(publishableIds[i], targetStatus)
        } catch (err) {
          const ep = episodes.find((e) => e.id === publishableIds[i])
          errors.push({
            title: ep?.title ?? publishableIds[i],
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    } finally {
      setBatchPublishProgress(null)
    }
    if (id) await fetchEpisodes(id)
    if (errors.length > 0) {
      const detail = errors.map((e) => `• ${e.title}: ${e.error}`).join('\n')
      window.alert(`${errors.length} episode(s) failed to publish:\n\n${detail}`)
    }
  }

  const handleBatchDelete = async (ids: string[]) => {
    for (const epId of ids) {
      await deleteEpisode(epId)
    }
  }

  return (
    <div>
      <SeriesHeader
        series={currentSeries}
        onBack={() => navigate('/series')}
        onEdit={() => setShowEdit(true)}
        onDelete={() => setShowDelete(true)}
        onUploadCover={handleUploadCover}
      />

      <Separator className="mb-6" />

      <EpisodeTable
        episodes={episodes}
        loading={episodesLoading}
        progresses={progresses}
        batchPublishProgress={batchPublishProgress}
        onEpisodeClick={(epId) => navigate(`/series/${id}/episodes/${epId}`)}
        onDeleteEpisode={deleteEpisode}
        transcriptionServices={transcriptionServices}
        onBatchTranscribe={handleBatchTranscribe}
        onBatchPublish={handleBatchPublish}
        onBatchDelete={handleBatchDelete}
        onNewEpisode={() => setShowCreateDialog(true)}
        activeBookImport={activeBookImport}
      />

      <EditSeriesDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        series={currentSeries}
        onSave={(data) => updateSeries(id!, data)}
        onUploadCover={handleUploadCover}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Series"
        description={`Are you sure you want to delete "${currentSeries.title}"? This will also delete all episodes in this series. This action cannot be undone.`}
        onConfirm={handleDeleteSeries}
      />

      <CreateEpisodeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSelect={handleCreationMethod}
      />
    </div>
  )
}
