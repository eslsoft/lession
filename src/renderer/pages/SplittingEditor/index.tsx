import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Play, ZoomIn, ZoomOut, Scissors, ArrowLeft, X } from 'lucide-react'
import { Waveform } from '../../components/Waveform'
import type { SplitMarker, SegmentRegion, WaveformHandle } from '../../components/Waveform'
import { useSeriesStore } from '../../stores/seriesStore'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'

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
  splitPointId: string | null  // null for first segment (starts at 0)
  title: string
}

export default function SplittingEditorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filePath = searchParams.get('file')
  const presetSeriesId = searchParams.get('seriesId')

  const { series, fetchSeries } = useSeriesStore()
  const [selectedSeriesId, setSelectedSeriesId] = useState(presetSeriesId ?? '')
  const [splitPoints, setSplitPoints] = useState<SplitPoint[]>([])
  const [segmentTitles, setSegmentTitles] = useState<Map<string | null, string>>(new Map())
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [splitting, setSplitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [loading, setLoading] = useState(false)

  const waveformRef = useRef<WaveformHandle>(null)

  // Audio URL via custom protocol (streamed by main process, no IPC transfer)
  const mediaUrl = filePath ? 'local-media://localhost' + encodeURI(filePath) : undefined

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  // Extract waveform peaks via ffmpeg (streaming, constant memory)
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

  // Load chapters from URL params → convert to split points
  useEffect(() => {
    const chaptersParam = searchParams.get('chapters')
    if (!chaptersParam) return
    try {
      const chapters = JSON.parse(decodeURIComponent(chaptersParam)) as { title: string; startTime: number; endTime: number }[]
      if (chapters.length === 0) return

      const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime)
      const points: SplitPoint[] = []
      const titles = new Map<string | null, string>()

      // First segment title (key = null)
      titles.set(null, sorted[0].title)

      // Each chapter boundary after the first becomes a split point
      for (let i = 1; i < sorted.length; i++) {
        const id = genId()
        points.push({ id, time: sorted[i].startTime })
        titles.set(id, sorted[i].title)
      }

      setSplitPoints(points)
      setSegmentTitles(titles)
    } catch {
      // ignore invalid chapters
    }
  }, [searchParams])

  // Derive segments from split points
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

  // Build waveform props
  const waveformSplitMarkers: SplitMarker[] = useMemo(
    () => splitPoints.map((sp) => ({ id: sp.id, time: sp.time })),
    [splitPoints],
  )

  const waveformSegmentRegions: SegmentRegion[] = useMemo(
    () => segments.map((seg, i) => ({ start: seg.start, end: seg.end, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] })),
    [segments],
  )

  const handleReady = useCallback((dur: number) => {
    // Duration may be more accurate from WaveSurfer than ffmpeg
    if (dur > 0) setDuration(dur)
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  // Double-click waveform → add split point
  const handleWaveformDblClick = useCallback((time: number) => {
    // Snap to avoid placing at exact 0 or duration
    const snapped = Math.max(0.1, Math.min(time, duration - 0.1))
    const id = genId()
    setSplitPoints((prev) => [...prev, { id, time: snapped }])
  }, [duration])

  // Drag split marker → update time
  const handleSplitMarkerDrag = useCallback((id: string, newTime: number) => {
    setSplitPoints((prev) => prev.map((sp) => sp.id === id ? { ...sp, time: newTime } : sp))
  }, [])

  // Remove a split point → merge segments
  const removeSplitPoint = useCallback((id: string) => {
    setSplitPoints((prev) => prev.filter((sp) => sp.id !== id))
    setSegmentTitles((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Update segment title
  const updateTitle = useCallback((key: string | null, title: string) => {
    setSegmentTitles((prev) => {
      const next = new Map(prev)
      next.set(key, title)
      return next
    })
  }, [])

  const handleSplit = async () => {
    if (!filePath || !selectedSeriesId || segments.length === 0) return

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

      await window.electronAPI.splitter.split(filePath, splitMarkers, selectedSeriesId)
      navigate(`/series/${selectedSeriesId}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSplitting(false)
    }
  }

  const seriesOptions = series.map((s) => ({ value: s.id, label: s.title }))

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground mb-4">No file selected.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    )
  }

  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Split Audio</h1>
          <p className="text-sm text-muted-foreground truncate">{fileName}</p>
        </div>
      </div>

      {/* Waveform */}
      <div>
        {loading && (
          <div className="flex items-center justify-center h-[150px] rounded-lg border border-border bg-card">
            <p className="text-sm text-muted-foreground">Loading waveform...</p>
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
            height={150}
          />
        )}
      </div>

      {/* Transport Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => waveformRef.current?.play()}>
          <Play className="h-4 w-4" />
        </Button>
        <div className="text-sm text-muted-foreground font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => waveformRef.current?.zoomOut()}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => waveformRef.current?.zoomIn()}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint */}
      <p className="text-sm text-muted-foreground">
        Double-click the waveform to add a split point. Drag markers to adjust.
      </p>

      {/* Segments Table */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Segments ({segments.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-20">Start</TableHead>
              <TableHead className="w-20">End</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map((seg) => (
              <TableRow
                key={seg.splitPointId ?? '__first'}
                className="cursor-pointer"
                onClick={() => waveformRef.current?.seekTo(seg.start)}
              >
                <TableCell className="font-mono text-muted-foreground">{seg.index + 1}</TableCell>
                <TableCell>
                  <Input
                    value={seg.title}
                    onChange={(e) => updateTitle(seg.splitPointId, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatTimeShort(seg.start)}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatTimeShort(seg.end)}
                </TableCell>
                <TableCell>
                  {seg.splitPointId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (seg.splitPointId) removeSplitPoint(seg.splitPointId)
                      }}
                      title="Remove split point (merge with previous)"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Actions */}
      <div className="flex items-end gap-4 pt-2">
        <div className="space-y-2 flex-1 max-w-xs">
          <Label>Target Series</Label>
          {seriesOptions.length > 0 ? (
            <Select
              options={[{ value: '', label: 'Select a series...' }, ...seriesOptions]}
              value={selectedSeriesId}
              onChange={(e) => setSelectedSeriesId(e.target.value)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No series available. Create one first.</p>
          )}
        </div>
        <Button
          onClick={handleSplit}
          disabled={splitting || !selectedSeriesId || segments.length === 0}
        >
          <Scissors className="h-4 w-4 mr-2" />
          {splitting ? 'Splitting...' : `Split into ${segments.length} Episode${segments.length !== 1 ? 's' : ''}`}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
          {error}
        </div>
      )}
    </div>
  )
}
