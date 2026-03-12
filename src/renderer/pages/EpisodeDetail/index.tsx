import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, AlertCircle, Loader2, Upload, Pencil, CheckCircle2, RefreshCw, FileAudio } from 'lucide-react'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useSeriesStore } from '../../stores/seriesStore'
import { useConfigStore } from '../../stores/configStore'
import { useTranscriptionStore } from '../../stores/transcriptionStore'
import MediaPlayer, { type MediaPlayerRef } from '../../components/MediaPlayer'
import TranscriptEditor from '../../components/TranscriptEditor'
import SegmentAnalysisPanel from '../../components/SegmentAnalysisPanel'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Progress } from '../../components/ui/progress'
import { Select } from '../../components/ui/select'
import type { PublishStatus, Segment, Transcript } from '../../../shared/types'
import { formatDuration, getStatusVariant, getStatusLabel } from './utils'
import EditDrawer from './EditDrawer'
import PublishDialog from './PublishDialog'

export default function EpisodeDetailPage() {
  const { seriesId, episodeId } = useParams<{ seriesId: string; episodeId: string }>()
  const { currentEpisode, loading, fetchEpisode, updateEpisode } = useEpisodeStore()
  const { series, fetchSeries } = useSeriesStore()
  const { config, fetchConfig, initialized } = useConfigStore()

  // ── Global transcription state ──
  const progress = useTranscriptionStore((s) => s.progresses[episodeId!])
  const completedIds = useTranscriptionStore((s) => s.completedIds)
  const clearProgress = useTranscriptionStore((s) => s.clear)
  const ackCompleted = useTranscriptionStore((s) => s.ackCompleted)

  const playerRef = useRef<MediaPlayerRef>(null)

  const [publishing, setPublishing] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [activeSegment, setActiveSegment] = useState<Segment | null>(null)

  // Transcription service selector
  const transcriptionServices = config?.services?.filter((s) => s.category === 'transcription') ?? []
  const [transcriptionServiceId, setTranscriptionServiceId] = useState(transcriptionServices[0]?.id ?? '')

  const currentSeries = series.find((s) => s.id === seriesId)

  // "is transcribing" is derived purely from the global store —
  // no local state needed, survives navigation.
  const isTranscribing = !!progress

  useEffect(() => {
    if (episodeId) fetchEpisode(episodeId)
    if (series.length === 0) fetchSeries()
    if (!initialized) fetchConfig()
  }, [episodeId])

  // Fetch transcript
  useEffect(() => {
    if (!episodeId) return
    window.electronAPI.transcript.get(episodeId).then(setTranscript)
  }, [episodeId, currentEpisode?.status])

  // When THIS episode's transcription finishes, refetch episode + transcript
  // and acknowledge the completion so the id is cleaned up.
  useEffect(() => {
    if (!episodeId || !completedIds.includes(episodeId)) return
    ackCompleted(episodeId)
    fetchEpisode(episodeId)
    window.electronAPI.transcript.get(episodeId).then(setTranscript)
  }, [completedIds, episodeId, ackCompleted, fetchEpisode])

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), [])

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time)
    playerRef.current?.play()
  }, [])

  const handleSegmentUpdate = useCallback(
    async (segmentIndex: number, text: string) => {
      if (!transcript || !episodeId) return
      await window.electronAPI.transcript.updateSegment(transcript.id, segmentIndex, text)
      setTranscript(await window.electronAPI.transcript.get(episodeId))
    },
    [transcript, episodeId],
  )

  const handleSegmentSplit = useCallback(
    async (segmentIndex: number, wordIndex: number) => {
      if (!transcript || !episodeId) return
      await window.electronAPI.transcript.splitSegment(transcript.id, segmentIndex, wordIndex)
      setTranscript(await window.electronAPI.transcript.get(episodeId))
    },
    [transcript, episodeId],
  )

  const openEditDrawer = () => {
    if (!currentEpisode) return
    setEditTitle(currentEpisode.title)
    setEditDescription(currentEpisode.description ?? '')
    setShowEditDrawer(true)
  }

  const handleSaveInfo = async () => {
    if (!episodeId) return
    await updateEpisode(episodeId, { title: editTitle, description: editDescription })
    setShowEditDrawer(false)
  }

  const handleTranscribe = useCallback(async () => {
    if (!episodeId || isTranscribing || !transcriptionServiceId) return
    setActionError(null)
    try {
      const result = await window.electronAPI.transcript.generate(episodeId, transcriptionServiceId)
      setTranscript(result)
      await fetchEpisode(episodeId)
    } catch (err) {
      setActionError((err as Error).message)
      await fetchEpisode(episodeId)
    } finally {
      clearProgress(episodeId)
    }
  }, [episodeId, isTranscribing, transcriptionServiceId, fetchEpisode, clearProgress])

  const handlePublish = useCallback(
    async (targetStatus: PublishStatus) => {
      if (!episodeId || publishing) return
      setPublishing(true)
      setActionError(null)
      try {
        if (targetStatus === 'published' || targetStatus === 'preview') {
          await window.electronAPI.publisher.publishEpisode(episodeId, targetStatus)
        } else {
          await window.electronAPI.publisher.unpublishEpisode(episodeId)
        }
        await fetchEpisode(episodeId)
      } catch (err) {
        setActionError((err as Error).message)
      } finally {
        setPublishing(false)
      }
    },
    [episodeId, publishing, fetchEpisode],
  )

  const handlePublishConfirm = useCallback(
    async (mode: PublishStatus) => { await handlePublish(mode); setShowPublishDialog(false) },
    [handlePublish],
  )

  const handleUnpublish = useCallback(
    async () => { await handlePublish('draft'); setShowPublishDialog(false) },
    [handlePublish],
  )

  // ── Render guards ──
  if (loading && !currentEpisode) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!currentEpisode) {
    return <div className="text-center py-16 text-muted-foreground">Episode not found</div>
  }

  // ── Derived state ──
  const localPath = currentEpisode.localPath
  const mediaSrc = localPath && !localPath.startsWith('http')
    ? 'local-media://localhost' + encodeURI(localPath)
    : localPath ?? null
  const hasError = !!currentEpisode.lastError || !!actionError
  const isTranscribed = currentEpisode.status === 'transcribed'
  const isConverting = currentEpisode.status === 'converting' || progress?.stage === 'converting'
  const needsConvert = currentEpisode.mimeType === 'audio' && localPath != null && !localPath.toLowerCase().endsWith('.m4a')
  const showConvert = needsConvert && !isConverting
  const showTranscribe = !isTranscribed || hasError
  const showRetranscribe = isTranscribed && !hasError
  const showPublishBtn = !!transcript
  const s3Ready = !!(config?.storage?.bucket && config?.storage?.endpoint)

  const publishBtnLabel =
    currentEpisode.publishStatus === 'draft' ? 'Publish' :
    currentEpisode.publishStatus === 'preview' ? 'Preview' : 'Published'

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">

      {/* Breadcrumb + status badges */}
      <div className="flex items-center justify-between shrink-0">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Series</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/series/${seriesId}`} className="hover:text-foreground transition-colors">
            {currentSeries?.title ?? 'Series'}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{currentEpisode.title}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(currentEpisode.status)}>
            {getStatusLabel(currentEpisode.status)}
          </Badge>
          {currentEpisode.publishStatus !== 'draft' && (
            <Badge variant={currentEpisode.publishStatus === 'published' ? 'default' : 'outline'}>
              {publishBtnLabel}
            </Badge>
          )}
        </div>
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">{currentEpisode.title}</h1>
            <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={openEditDrawer}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          {currentEpisode.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{currentEpisode.description}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{formatDuration(currentEpisode.duration)}</span>
            <span>·</span>
            <span>{currentEpisode.mimeType}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {(showTranscribe || showRetranscribe) && transcriptionServices.length > 0 && (
            <Select
              value={transcriptionServiceId}
              onChange={(e) => setTranscriptionServiceId(e.target.value)}
              options={transcriptionServices.map((s) => ({ value: s.id, label: s.name }))}
              className="w-40 h-8 text-xs"
            />
          )}
          {showConvert && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (episodeId) window.electronAPI.converter.convert(episodeId)
              }}
            >
              <FileAudio className="mr-1.5 h-3 w-3" />
              Convert to M4A
            </Button>
          )}
          {showRetranscribe && (
            <Button variant="outline" size="sm" onClick={handleTranscribe} disabled={isTranscribing}>
              {isTranscribing
                ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                : <RefreshCw className="mr-1.5 h-3 w-3" />}
              Retranscribe
            </Button>
          )}
          {showTranscribe && (
            <Button
              variant={hasError ? 'destructive' : 'default'}
              size="sm"
              onClick={handleTranscribe}
              disabled={isTranscribing}
            >
              {isTranscribing && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {hasError ? 'Retry Transcribe' : 'Transcribe'}
            </Button>
          )}
          {showPublishBtn && (
            <Button
              variant={currentEpisode.publishStatus === 'draft' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowPublishDialog(true)}
              disabled={publishing}
              title={!s3Ready ? 'S3 storage not configured' : undefined}
            >
              {publishing
                ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                : currentEpisode.publishStatus !== 'draft'
                  ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {publishBtnLabel}
            </Button>
          )}
        </div>
      </div>

      {/* Transcription progress */}
      {isTranscribing && (
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {progress?.stage === 'converting' && 'Converting to M4A...'}
            {progress?.stage === 'transcribing' && 'Transcribing...'}
            {progress?.stage === 'nlp' && 'NLP processing...'}
            {!progress?.stage && 'Starting...'}
          </div>
          <Progress value={progress?.percent ?? 0} />
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="flex items-start gap-2 text-destructive shrink-0">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{actionError ?? currentEpisode.lastError?.message}</p>
        </div>
      )}

      {/* Transcript editor + Analysis panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="rounded-lg bg-muted/30 flex-1 min-w-0">
          <TranscriptEditor
            transcript={transcript}
            currentTime={currentTime}
            onSeek={handleSeek}
            onSegmentEdit={handleSegmentUpdate}
            onSegmentSplit={handleSegmentSplit}
            onActiveSegmentChange={setActiveSegment}
          />
        </div>
        {transcript && (
          <div className="rounded-lg bg-muted/30 w-80 shrink-0">
            <SegmentAnalysisPanel segment={activeSegment} />
          </div>
        )}
      </div>

      {/* Media player */}
      <div className="shrink-0">
        {mediaSrc ? (
          <MediaPlayer
            ref={playerRef}
            src={mediaSrc}
            mimeType={currentEpisode.mimeType}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : (
          <div className="flex items-center justify-center h-32 bg-muted/40 rounded-lg text-muted-foreground">
            No media file
          </div>
        )}
      </div>

      <EditDrawer
        open={showEditDrawer}
        onOpenChange={setShowEditDrawer}
        title={editTitle}
        description={editDescription}
        onTitleChange={setEditTitle}
        onDescriptionChange={setEditDescription}
        onSave={handleSaveInfo}
      />

      {showPublishDialog && (
        <PublishDialog
          open={showPublishDialog}
          onClose={() => setShowPublishDialog(false)}
          episode={currentEpisode}
          s3Ready={s3Ready}
          publishing={publishing}
          onPublish={handlePublishConfirm}
          onUnpublish={handleUnpublish}
        />
      )}
    </div>
  )
}
