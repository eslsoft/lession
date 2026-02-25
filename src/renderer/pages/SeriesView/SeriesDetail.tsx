import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSeriesStore } from '../../stores/seriesStore'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useTranscriptionStore } from '../../stores/transcriptionStore'
import { MEDIA_FILE_FILTER, IMAGE_FILE_FILTER, isVideoPath } from '@shared/media-formats'
import { Separator } from '../../components/ui/separator'
import { SeriesHeader } from './SeriesHeader'
import { EditSeriesDialog } from './EditSeriesDialog'
import { NewEpisodeDialog } from './NewEpisodeDialog'
import { EpisodeTable } from './EpisodeTable'
import { ConfirmDialog } from './ConfirmDialog'

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { series, fetchSeries, updateSeries, deleteSeries, uploadCover } = useSeriesStore()
  const { episodes, loading: episodesLoading, fetchEpisodes, createEpisode, deleteEpisode } = useEpisodeStore()
  const progresses = useTranscriptionStore((s) => s.progresses)
  const completedIds = useTranscriptionStore((s) => s.completedIds)
  const ackCompleted = useTranscriptionStore((s) => s.ackCompleted)

  const currentSeries = series.find((s) => s.id === id)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showNewEpisode, setShowNewEpisode] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [newEpTitle, setNewEpTitle] = useState('')

  useEffect(() => {
    if (!currentSeries) fetchSeries()
  }, [currentSeries, fetchSeries])

  useEffect(() => {
    if (id) fetchEpisodes(id)
  }, [id, fetchEpisodes])

  // When any episode in this series finishes transcription, ack + refetch
  // so the status badge updates from "transcribing" → "transcribed".
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

  const handleSelectFileAndShowDialog = async () => {
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [MEDIA_FILE_FILTER],
    })
    if (!filePath) return
    setSelectedFile(filePath)
    setNewEpTitle(filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '')
    setShowNewEpisode(true)
  }

  const handleCreateEpisode = async (title: string, filePath: string) => {
    if (!id) return
    const isVideo = isVideoPath(filePath)
    const metadata = await window.electronAPI.splitter.getMetadata(filePath)
    const episode = await createEpisode({
      seriesId: id,
      title,
      order: episodes.length,
      mimeType: isVideo ? 'video' : 'audio',
      localPath: filePath,
      duration: metadata.duration,
      source: { type: 'direct', origin: filePath },
      status: 'ready',
      publishStatus: 'draft',
    })
    setShowNewEpisode(false)
    navigate(`/series/${id}/episodes/${episode.id}`)
  }

  const handleSplitImport = async () => {
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [MEDIA_FILE_FILTER],
    })
    if (!filePath) return
    navigate(`/split?file=${encodeURIComponent(filePath)}&seriesId=${id}`)
  }

  const handleBatchPublish = async (ids: string[], targetStatus: 'preview' | 'published') => {
    for (const epId of ids) {
      const ep = episodes.find((e) => e.id === epId)
      if (ep && ep.status === 'transcribed') {
        await window.electronAPI.publisher.publishEpisode(epId, targetStatus)
      }
    }
    if (id) await fetchEpisodes(id)
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
        onEpisodeClick={(epId) => navigate(`/series/${id}/episodes/${epId}`)}
        onDeleteEpisode={deleteEpisode}
        onBatchPublish={handleBatchPublish}
        onBatchDelete={handleBatchDelete}
        onNewEpisode={handleSelectFileAndShowDialog}
        onSplitImport={handleSplitImport}
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

      <NewEpisodeDialog
        open={showNewEpisode}
        onOpenChange={setShowNewEpisode}
        selectedFile={selectedFile}
        defaultTitle={newEpTitle}
        onCreate={handleCreateEpisode}
      />
    </div>
  )
}
