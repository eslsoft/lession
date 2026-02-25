import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Play, Pause, ZoomIn, ZoomOut, Scissors, ArrowLeft, X, Loader2, Mic, Check, Search, Plus, AudioLines } from 'lucide-react'
import { Waveform } from '../../components/Waveform'
import type { SplitMarker, SegmentRegion, WaveformHandle } from '../../components/Waveform'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import type { Segment } from '../../../shared/types'

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

export default function SplittingEditorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filePath = searchParams.get('file')
  const presetSeriesId = searchParams.get('seriesId')

  const seriesId = presetSeriesId ?? ''
  const [splitPoints, setSplitPoints] = useState<SplitPoint[]>([])
  const [segmentTitles, setSegmentTitles] = useState<Map<string | null, string>>(new Map())
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [splitting, setSplitting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [hasTranscript, setHasTranscript] = useState(false)
  const [transcriptSegments, setTranscriptSegments] = useState<Segment[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [detectingSilence, setDetectingSilence] = useState(false)
  const [silenceMinDuration, setSilenceMinDuration] = useState('5')

  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [loading, setLoading] = useState(false)

  const waveformRef = useRef<WaveformHandle>(null)

  const mediaUrl = filePath ? 'local-media://localhost' + encodeURI(filePath) : undefined

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

  // Load existing transcript on mount
  useEffect(() => {
    if (!filePath) return
    window.electronAPI.transcript.getFileTranscript(filePath).then((segs) => {
      if (segs) {
        setTranscriptSegments(segs)
        setHasTranscript(true)
      }
    })
  }, [filePath])

  useEffect(() => {
    const cleanup = window.electronAPI.transcript.onFileProgress((data) => {
      setTranscribeProgress(data.percent)
    })
    return cleanup
  }, [])

  useEffect(() => {
    const chaptersParam = searchParams.get('chapters')
    if (!chaptersParam) return
    try {
      const chapters = JSON.parse(decodeURIComponent(chaptersParam)) as { title: string; startTime: number; endTime: number }[]
      if (chapters.length === 0) return
      const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime)
      const points: SplitPoint[] = []
      const titles = new Map<string | null, string>()
      titles.set(null, sorted[0].title)
      for (let i = 1; i < sorted.length; i++) {
        const id = genId()
        points.push({ id, time: sorted[i].startTime })
        titles.set(id, sorted[i].title)
      }
      setSplitPoints(points)
      setSegmentTitles(titles)
    } catch { /* ignore */ }
  }, [searchParams])

  const searchResults = useMemo(() => {
    if (!transcriptSegments || !searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return transcriptSegments
      .filter((seg) => seg.text.toLowerCase().includes(q))
      .slice(0, 50)
  }, [transcriptSegments, searchQuery])

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

  // Which segment is currently playing
  const activeSegmentIndex = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return i
    }
    return 0
  }, [segments, currentTime])

  const waveformSplitMarkers: SplitMarker[] = useMemo(
    () => splitPoints.map((sp) => ({ id: sp.id, time: sp.time })),
    [splitPoints],
  )

  const waveformSegmentRegions: SegmentRegion[] = useMemo(
    () => segments.map((seg, i) => ({ start: seg.start, end: seg.end, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] })),
    [segments],
  )

  const handleReady = useCallback((dur: number) => {
    if (dur > 0) setDuration(dur)
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleWaveformDblClick = useCallback((time: number) => {
    const snapped = Math.max(0.1, Math.min(time, duration - 0.1))
    const id = genId()
    setSplitPoints((prev) => [...prev, { id, time: snapped }])
  }, [duration])

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

  const updateTitle = useCallback((key: string | null, title: string) => {
    setSegmentTitles((prev) => {
      const next = new Map(prev)
      next.set(key, title)
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
    // Small delay so seek completes before play
    setTimeout(() => waveformRef.current?.play(), 50)
  }, [])

  const handleTranscribe = async () => {
    if (!filePath) return
    setTranscribing(true)
    setError(null)
    setTranscribeProgress(0)
    try {
      const segs = await window.electronAPI.transcript.transcribeFile(filePath)
      setTranscriptSegments(segs)
      setHasTranscript(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTranscribing(false)
    }
  }

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

  const fileName = filePath.split('/').pop() ?? filePath
  const busy = transcribing || detectingSilence

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Split Audio</h1>
          <p className="text-sm text-muted-foreground truncate">{fileName}</p>
        </div>
        <Button
          onClick={handleSplit}
          disabled={splitting || !seriesId || segments.length === 0}
        >
          <Scissors className="h-4 w-4 mr-2" />
          {splitting ? 'Splitting...' : `Split into ${segments.length} episodes`}
        </Button>
      </div>

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

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">
          Click to seek · Double-click to split · Drag to adjust
        </span>
      </div>

      {/* Tools bar */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8" onClick={handleTranscribe} disabled={busy || loading}>
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

      {/* Segments */}
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
                {/* Index */}
                <span className="text-xs font-mono text-muted-foreground w-6 text-right flex-shrink-0">
                  {seg.index + 1}
                </span>

                {/* Color dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SEGMENT_COLORS[seg.index % SEGMENT_COLORS.length].replace('0.15', '0.8') }}
                />

                {/* Title */}
                <Input
                  value={seg.title}
                  onChange={(e) => updateTitle(seg.splitPointId, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="h-7 text-sm flex-1"
                />

                {/* Times */}
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {formatTimeShort(seg.start)}
                </span>
                <span className="text-xs text-muted-foreground">–</span>
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {formatTimeShort(seg.end)}
                </span>

                {/* Duration badge */}
                <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono whitespace-nowrap min-w-[52px] text-center">
                  {formatDuration(segDuration)}
                </span>

                {/* Remove / Merge */}
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

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {error}
        </div>
      )}
    </div>
  )
}
