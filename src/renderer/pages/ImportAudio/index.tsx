import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Pause, ZoomIn, ZoomOut, Scissors, Loader2,
  Mic, Check, Search, Plus, AudioLines, X,
} from 'lucide-react'
import { Waveform } from '../../components/Waveform'
import type { SplitMarker, SegmentRegion, WaveformHandle } from '../../components/Waveform'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useConfigStore } from '../../stores/configStore'
import { useSeriesStore } from '../../stores/seriesStore'
import { Select } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { isVideoPath } from '@shared/media-formats'
import type { Segment } from '@shared/types'

const SEGMENT_COLORS = [
  'rgba(99, 102, 241, 0.15)',
  'rgba(236, 72, 153, 0.15)',
  'rgba(16, 185, 129, 0.15)',
  'rgba(245, 158, 11, 0.15)',
  'rgba(139, 92, 246, 0.15)',
  'rgba(6, 182, 212, 0.15)',
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

let nextId = 1
function genId(): string {
  return `split-${nextId++}`
}

interface SplitPoint {
  id: string
  time: number
}

interface DerivedSegment {
  index: number
  start: number
  end: number
  splitPointId: string | null
  title: string
}

export default function ImportAudioPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { createEpisode } = useEpisodeStore()
  const { config } = useConfigStore()
  const transcriptionServices = config?.services?.filter((s) => s.category === 'transcription') ?? []

  const filePath = searchParams.get('file')
  const seriesId = searchParams.get('seriesId') ?? ''
  const initialMode = searchParams.get('mode') as 'single' | 'split' | null

  interface MediaMetadata {
    duration: number
    format: string
    hasVideo: boolean
    chapters?: { start: number; end: number; title: string }[]
    tags?: {
      title?: string
      artist?: string
      album?: string
      date?: string
      genre?: string
      comment?: string
    }
    coverPath?: string
  }

  const { series, fetchSeries, uploadCover } = useSeriesStore()
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null)
  const [useBookCover, setUseBookCover] = useState(false)

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  const currentSeries = useMemo(() => {
    return series.find((s) => s.id === seriesId)
  }, [series, seriesId])

  const [mode, setMode] = useState<'single' | 'split'>(initialMode ?? 'single')

  // Common state
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Single mode state
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  // Split mode state
  const [splitPoints, setSplitPoints] = useState<SplitPoint[]>([])
  const [segmentTitles, setSegmentTitles] = useState<Map<string | null, string>>(new Map())
  const [splitting, setSplitting] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [hasTranscript, setHasTranscript] = useState(false)
  const [transcriptSegments, setTranscriptSegments] = useState<Segment[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [detectingSilence, setDetectingSilence] = useState(false)
  const [silenceMinDuration, setSilenceMinDuration] = useState('5')
  const [transcriptionServiceId, setTranscriptionServiceId] = useState(transcriptionServices[0]?.id ?? '')

  const waveformRef = useRef<WaveformHandle>(null)

  const mediaUrl = filePath ? 'local-media://localhost' + encodeURI(filePath) : undefined
  const fileName = filePath?.split('/').pop() ?? ''

  // Set default title from filename
  useEffect(() => {
    if (filePath) {
      setTitle(filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '')
    }
  }, [filePath])

  // Load peaks
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    setLoading(true)
    window.electronAPI.media.extractPeaks(filePath).then((result) => {
      if (cancelled) return
      setPeaks(new Float32Array(result.peaks))
      setDuration(result.duration)
    }).catch((err) => {
      if (!cancelled) setError(`Failed to load audio: ${(err as Error).message}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [filePath])

  // Load chapters from metadata
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    window.electronAPI.splitter.getMetadata(filePath)
      .then((meta) => {
        if (cancelled) return
        setMetadata(meta)

        // Pre-populate single mode title
        if (meta.tags?.title) {
          setTitle(meta.tags.title)
        }

        // Pre-populate cover art setting: if book has cover and series doesn't, check the box!
        if (meta.coverPath && currentSeries && !currentSeries.coverPath) {
          setUseBookCover(true)
        }

        if (meta.chapters && meta.chapters.length > 0) {
          const pts: SplitPoint[] = []
          const titles = new Map<string | null, string>()

          // Populate the title of the first segment (which starts at index 0)
          titles.set(null, meta.chapters[0].title)

          for (let i = 0; i < meta.chapters.length - 1; i++) {
            const id = genId()
            pts.push({
              id,
              time: meta.chapters[i].end,
            })
            // The segment starting after this split point
            titles.set(id, meta.chapters[i + 1].title)
          }

          setSplitPoints(pts)
          setSegmentTitles(titles)
          // Pre-populate split points so the split editor is ready if chosen, but
          // respect an explicit "single" import — chapters are kept as the
          // episode's internal markers rather than forcing a split.
          if (initialMode !== 'single') setMode('split')
        }
      })
      .catch((err) => {
        console.error('Failed to load chapters:', err)
      })
    return () => { cancelled = true }
  }, [filePath, currentSeries])

  // Load existing transcript
  useEffect(() => {
    if (!filePath) return
    window.electronAPI.transcript.getFileTranscript(filePath).then((segs) => {
      if (segs) {
        setTranscriptSegments(segs)
        setHasTranscript(true)
      }
    })
  }, [filePath])

  // Transcription progress
  useEffect(() => {
    const cleanup = window.electronAPI.transcript.onFileProgress((data) => {
      setTranscribeProgress(data.percent)
    })
    return cleanup
  }, [])

  // Split mode: derived segments
  const segments: DerivedSegment[] = useMemo(() => {
    if (duration === 0) return []
    const sorted = [...splitPoints].sort((a, b) => a.time - b.time)
    const times = [0, ...sorted.map((s) => s.time), duration]
    return times.slice(0, -1).map((start, i) => ({
      index: i,
      start,
      end: times[i + 1],
      splitPointId: i > 0 ? sorted[i - 1].id : null,
      title: segmentTitles.get(i > 0 ? sorted[i - 1].id : null) ?? `Segment ${i + 1}`,
    }))
  }, [splitPoints, duration, segmentTitles])

  const activeSegmentIndex = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return i
    }
    return 0
  }, [segments, currentTime])

  const searchResults = useMemo(() => {
    if (!transcriptSegments || !searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return transcriptSegments
      .filter((seg) => seg.text.toLowerCase().includes(q))
      .slice(0, 50)
  }, [transcriptSegments, searchQuery])

  const waveformSplitMarkers: SplitMarker[] = useMemo(
    () => mode === 'split' ? splitPoints.map((sp) => ({ id: sp.id, time: sp.time })) : [],
    [splitPoints, mode],
  )

  const waveformSegmentRegions: SegmentRegion[] = useMemo(
    () => mode === 'split' ? segments.map((seg, i) => ({ start: seg.start, end: seg.end, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] })) : [],
    [segments, mode],
  )

  // Waveform callbacks
  const handleReady = useCallback((dur: number) => {
    if (dur > 0) setDuration(dur)
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleWaveformDblClick = useCallback((time: number) => {
    if (mode !== 'split') return
    const snapped = Math.max(0.1, Math.min(time, duration - 0.1))
    const id = genId()
    setSplitPoints((prev) => [...prev, { id, time: snapped }])
  }, [duration, mode])

  const handleSplitMarkerDrag = useCallback((id: string, newTime: number) => {
    setSplitPoints((prev) => prev.map((sp) => sp.id === id ? { ...sp, time: newTime } : sp))
  }, [])

  const removeSplitPoint = useCallback((id: string) => {
    setSplitPoints((prev) => prev.filter((sp) => sp.id !== id))
    setSegmentTitles((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const updateSegmentTitle = useCallback((key: string | null, t: string) => {
    setSegmentTitles((prev) => {
      const next = new Map(prev)
      next.set(key, t)
      return next
    })
  }, [])

  const addSplitAt = useCallback((time: number) => {
    const snapped = Math.max(0.1, Math.min(time, duration - 0.1))
    const id = genId()
    setSplitPoints((prev) => [...prev, { id, time: snapped }])
  }, [duration])

  const seekAndPlay = useCallback((time: number) => {
    if (!waveformRef.current) return
    waveformRef.current.seekTo(time)
    setTimeout(() => waveformRef.current?.play(), 50)
  }, [])

  // Single mode: create episode
  const handleCreateSingle = async () => {
    if (!filePath || !seriesId || !title.trim() || !metadata) return
    setCreating(true)
    setError(null)
    try {
      const isVideo = isVideoPath(filePath)
      const needsConvert = !isVideo && !filePath.toLowerCase().endsWith('.m4a')

      if (useBookCover && metadata.coverPath) {
        await uploadCover(seriesId, metadata.coverPath)
      }

      const episode = await createEpisode({
        seriesId,
        title: title.trim(),
        order: 0,
        mimeType: isVideo ? 'video' : 'audio',
        localPath: filePath,
        duration: metadata.duration,
        chapters: metadata.chapters && metadata.chapters.length > 0 ? metadata.chapters : undefined,
        source: { type: 'direct', origin: filePath },
        status: needsConvert ? 'converting' : 'ready',
        publishStatus: 'draft',
      })
      if (needsConvert) {
        window.electronAPI.converter.convert(episode.id)
      }
      navigate(`/series/${seriesId}/episodes/${episode.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  // Split mode: transcribe
  const handleTranscribe = async () => {
    if (!filePath || !transcriptionServiceId) return
    setTranscribing(true)
    setError(null)
    setTranscribeProgress(0)
    try {
      const segs = await window.electronAPI.transcript.transcribeFile(filePath, transcriptionServiceId)
      setTranscriptSegments(segs)
      setHasTranscript(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTranscribing(false)
    }
  }

  // Split mode: detect silence
  const handleDetectSilence = async () => {
    if (!filePath) return
    setDetectingSilence(true)
    setError(null)
    try {
      const minDur = parseFloat(silenceMinDuration) || 5
      const gaps = await window.electronAPI.splitter.detectSilence(filePath, '-30dB', minDur)
      if (gaps.length === 0) {
        setError('No silence gaps detected. Try lowering the minimum duration.')
        return
      }
      const newPoints: SplitPoint[] = []
      const newTitles = new Map<string | null, string>()
      newTitles.set(null, 'Segment 1')
      for (let i = 0; i < gaps.length; i++) {
        const id = genId()
        newPoints.push({ id, time: (gaps[i].start + gaps[i].end) / 2 })
        newTitles.set(id, `Segment ${i + 2}`)
      }
      setSplitPoints(newPoints)
      setSegmentTitles(newTitles)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDetectingSilence(false)
    }
  }

  // Split mode: split and create episodes
  const handleSplit = async () => {
    if (!filePath || !seriesId || segments.length === 0) return
    const validSegments = segments.filter((s) => s.end > s.start && s.title.trim())
    if (validSegments.length === 0) {
      setError('All segments need a title and valid time range.')
      return
    }
    setSplitting(true)
    setError(null)
    try {
      if (useBookCover && metadata?.coverPath) {
        await uploadCover(seriesId, metadata.coverPath)
      }

      const splitMarkers = validSegments.map((s) => ({
        start: s.start,
        end: s.end,
        title: s.title.trim(),
      }))
      await window.electronAPI.splitter.split(filePath, splitMarkers, seriesId)
      navigate(`/series/${seriesId}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSplitting(false)
    }
  }

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">No file selected.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    )
  }

  const busy = transcribing || detectingSilence

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/series/${seriesId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Import Audio</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate max-w-[300px]">{fileName}</span>
          {duration > 0 && <span>{formatTime(duration)}</span>}
        </div>
      </div>

      {/* Audiobook Meta Info (Cover Art & Book Details) */}
      {metadata?.coverPath && (
        <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
          <img
            src={`local-media://localhost${encodeURI(metadata.coverPath)}`}
            alt="Audiobook Cover"
            className="w-12 h-12 rounded object-cover shadow-sm bg-muted flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {metadata.tags?.title || 'Unknown Title'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {metadata.tags?.artist || 'Unknown Artist'}
              {metadata.tags?.date ? ` · ${metadata.tags.date}` : ''}
              {metadata.tags?.genre ? ` · ${metadata.tags.genre}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 pr-2">
            <Switch
              id="use-book-cover"
              checked={useBookCover}
              onCheckedChange={setUseBookCover}
            />
            <Label htmlFor="use-book-cover" className="text-xs font-medium cursor-pointer select-none">
              Use as Series Cover
            </Label>
          </div>
        </div>
      )}

      {/* Waveform */}
      {loading && (
        <div className="flex items-center justify-center h-[150px] rounded-lg border border-border bg-card">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {peaks && mediaUrl && (
        <Waveform
          ref={waveformRef}
          url={mediaUrl}
          peaks={peaks}
          mediaDuration={duration}
          splitMarkers={waveformSplitMarkers}
          segmentRegions={waveformSegmentRegions}
          onReady={handleReady}
          onTimeUpdate={handleTimeUpdate}
          onWaveformDblClick={handleWaveformDblClick}
          onSplitMarkerDrag={handleSplitMarkerDrag}
          onPlayPause={setIsPlaying}
          height={150}
        />
      )}

      {/* Transport bar */}
      {peaks && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => waveformRef.current?.play()}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <span className="text-sm text-muted-foreground font-mono tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => waveformRef.current?.zoomOut()}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => waveformRef.current?.zoomIn()}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {mode === 'split' && (
            <>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                Click to seek · Double-click to split · Drag to adjust
              </span>
            </>
          )}
        </div>
      )}

      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-3">
        <button
          className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
            mode === 'single'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30'
          }`}
          onClick={() => setMode('single')}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            mode === 'single' ? 'border-primary' : 'border-muted-foreground'
          }`}>
            {mode === 'single' && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
          <div>
            <p className={`text-sm font-medium ${mode === 'single' ? '' : 'text-muted-foreground'}`}>
              Create as Single Episode
            </p>
            <p className="text-xs text-muted-foreground">Use the entire file as one episode</p>
          </div>
        </button>

        <button
          className={`flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
            mode === 'split'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/30'
          }`}
          onClick={() => setMode('split')}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            mode === 'split' ? 'border-primary' : 'border-muted-foreground'
          }`}>
            {mode === 'split' && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
          <div>
            <p className={`text-sm font-medium ${mode === 'split' ? '' : 'text-muted-foreground'}`}>
              Split into Multiple Episodes
            </p>
            <p className="text-xs text-muted-foreground">Use waveform editor to split at silence or custom points</p>
          </div>
        </button>
      </div>

      {/* Single Mode Content */}
      {mode === 'single' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ep-title">Episode Title</Label>
            <Input
              id="ep-title"
              placeholder="Episode title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {metadata?.chapters && metadata.chapters.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {metadata.chapters.length} chapters detected — kept as in-episode markers (edit later on the episode page).
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate(`/series/${seriesId}`)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSingle} disabled={creating || !title.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? 'Creating...' : 'Create Episode'}
            </Button>
          </div>
        </>
      )}

      {/* Split Mode Content */}
      {mode === 'split' && (
        <>
          {/* Tools bar */}
          <div className="flex items-center gap-2">
            {transcriptionServices.length > 0 && (
              <Select
                value={transcriptionServiceId}
                onChange={(e) => setTranscriptionServiceId(e.target.value)}
                options={transcriptionServices.map((s) => ({ value: s.id, label: s.name }))}
                className="w-36 h-8 text-xs"
              />
            )}
            <Button variant="outline" size="sm" className="h-8" onClick={handleTranscribe} disabled={busy || loading || !transcriptionServiceId}>
              {transcribing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : hasTranscript ? (
                <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
              ) : (
                <Mic className="h-3.5 w-3.5 mr-1.5" />
              )}
              {transcribing ? `${transcribeProgress}%` : hasTranscript ? 'Transcribed' : 'Transcribe'}
            </Button>

            <div className="w-px h-6 bg-border" />

            <Button variant="outline" size="sm" className="h-8" onClick={handleDetectSilence} disabled={busy || loading}>
              {detectingSilence ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <AudioLines className="h-3.5 w-3.5 mr-1.5" />
              )}
              Detect Silence
            </Button>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Min</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={silenceMinDuration}
                onChange={(e) => setSilenceMinDuration(e.target.value)}
                className="h-7 w-20 text-xs"
                title="Minimum silence duration (seconds)"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>

            <div className="flex-1" />
            <span className="text-sm text-muted-foreground">{segments.length} segments</span>
          </div>

          {/* Transcript search */}
          {hasTranscript && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transcript..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>

              {searchQuery.trim() && (
                <div className="rounded-lg border border-border max-h-48 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No matches found.</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {searchResults.map((seg, i) => {
                        const q = searchQuery.toLowerCase()
                        const textLower = seg.text.toLowerCase()
                        const matchIdx = textLower.indexOf(q)
                        const before = seg.text.slice(0, matchIdx)
                        const match = seg.text.slice(matchIdx, matchIdx + searchQuery.length)
                        const after = seg.text.slice(matchIdx + searchQuery.length)

                        return (
                          <div
                            key={i}
                            className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer group"
                            onClick={() => waveformRef.current?.seekTo(seg.start)}
                          >
                            <span className="text-xs font-mono text-muted-foreground whitespace-nowrap pt-0.5">
                              {formatTimeShort(seg.start)}
                            </span>
                            <p className="text-sm flex-1 min-w-0 truncate">
                              {before}<mark className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5">{match}</mark>{after}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                addSplitAt(seg.start)
                              }}
                              title="Add split point here"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Segments list */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
              <h2 className="text-sm font-medium">Segments ({segments.length})</h2>
            </div>
            <div className="divide-y divide-border">
              {segments.map((seg) => {
                const segDuration = seg.end - seg.start
                const isActive = seg.index === activeSegmentIndex

                return (
                  <div
                    key={seg.splitPointId ?? '__first'}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                      isActive ? 'bg-accent/50' : 'hover:bg-muted/30'
                    }`}
                    onClick={() => waveformRef.current?.seekTo(seg.start)}
                    onDoubleClick={() => seekAndPlay(seg.start)}
                  >
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right flex-shrink-0">
                      {seg.index + 1}
                    </span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: SEGMENT_COLORS[seg.index % SEGMENT_COLORS.length].replace('0.15', '0.8') }}
                    />
                    <Input
                      value={seg.title}
                      onChange={(e) => updateSegmentTitle(seg.splitPointId, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="h-7 text-sm flex-1"
                    />
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatTimeShort(seg.start)}
                    </span>
                    <span className="text-xs text-muted-foreground">–</span>
                    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {formatTimeShort(seg.end)}
                    </span>
                    <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono whitespace-nowrap min-w-[52px] text-center">
                      {formatDuration(segDuration)}
                    </span>
                    {seg.splitPointId ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (seg.splitPointId) removeSplitPoint(seg.splitPointId)
                        }}
                        title="Remove split point (merge with previous)"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <div className="w-6 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
              {segments.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No segments yet. Use Detect Silence or double-click the waveform to add split points.
                </div>
              )}
            </div>
          </div>

          {/* Split actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate(`/series/${seriesId}`)}>
              Cancel
            </Button>
            <Button onClick={handleSplit} disabled={splitting || segments.length === 0}>
              <Scissors className="h-4 w-4 mr-2" />
              {splitting ? 'Splitting...' : `Split & Create ${segments.length} Episode${segments.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {error}
        </div>
      )}
    </div>
  )
}
