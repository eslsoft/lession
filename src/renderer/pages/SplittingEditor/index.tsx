import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Play, ZoomIn, ZoomOut, Scissors, ArrowLeft, GripVertical } from 'lucide-react'
import { Waveform, useWaveformControls } from '../../components/Waveform'
import type { WaveformRegion } from '../../components/Waveform'
import { useSeriesStore } from '../../stores/seriesStore'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Card, CardContent } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'

interface Marker {
  id: string
  start: number
  end: number
  title: string
}

const COLORS = [
  'rgba(99, 102, 241, 0.2)',
  'rgba(236, 72, 153, 0.2)',
  'rgba(16, 185, 129, 0.2)',
  'rgba(245, 158, 11, 0.2)',
  'rgba(139, 92, 246, 0.2)',
  'rgba(6, 182, 212, 0.2)',
]

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

let nextId = 1
function genId(): string {
  return `marker-${nextId++}`
}

export default function SplittingEditorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filePath = searchParams.get('file')
  const presetSeriesId = searchParams.get('seriesId')

  const { series, fetchSeries } = useSeriesStore()
  const [selectedSeriesId, setSelectedSeriesId] = useState(presetSeriesId ?? '')
  const [markers, setMarkers] = useState<Marker[]>([])
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [splitting, setSplitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)

  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const controls = useWaveformControls(waveformContainerRef)

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  // Load chapters from download if available (via URL params)
  useEffect(() => {
    const chaptersParam = searchParams.get('chapters')
    if (chaptersParam) {
      try {
        const chapters = JSON.parse(decodeURIComponent(chaptersParam)) as { title: string; startTime: number; endTime: number }[]
        setMarkers(chapters.map((ch) => ({
          id: genId(),
          start: ch.startTime,
          end: ch.endTime,
          title: ch.title,
        })))
      } catch {
        // ignore invalid chapters
      }
    }
  }, [searchParams])

  const handleReady = useCallback((dur: number) => {
    setDuration(dur)
    // If no markers exist and no chapters, add a single marker covering the full file
    setMarkers((prev) => {
      if (prev.length === 0) {
        return [{ id: genId(), start: 0, end: dur, title: 'Segment 1' }]
      }
      return prev
    })
  }, [])

  const handleRegionUpdate = useCallback((id: string, start: number, end: number) => {
    setMarkers((prev) => prev.map((m) => m.id === id ? { ...m, start, end } : m))
  }, [])

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleRegionClick = useCallback((id: string) => {
    setSelectedMarkerId(id)
  }, [])

  const addMarkerAtCurrent = () => {
    const start = currentTime
    const end = Math.min(start + 30, duration)
    if (end <= start) return
    const newMarker: Marker = {
      id: genId(),
      start,
      end,
      title: `Segment ${markers.length + 1}`,
    }
    setMarkers((prev) => [...prev, newMarker])
    setSelectedMarkerId(newMarker.id)
  }

  const splitAtCurrent = () => {
    // Find the marker that contains currentTime and split it
    const idx = markers.findIndex((m) => currentTime > m.start && currentTime < m.end)
    if (idx === -1) return

    const m = markers[idx]
    const left: Marker = { id: m.id, start: m.start, end: currentTime, title: m.title }
    const right: Marker = { id: genId(), start: currentTime, end: m.end, title: `Segment ${markers.length + 1}` }

    setMarkers((prev) => {
      const next = [...prev]
      next.splice(idx, 1, left, right)
      return next
    })
  }

  const removeMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id))
    if (selectedMarkerId === id) setSelectedMarkerId(null)
  }

  const updateMarkerTitle = (id: string, title: string) => {
    setMarkers((prev) => prev.map((m) => m.id === id ? { ...m, title } : m))
  }

  const handleSplit = async () => {
    if (!filePath || !selectedSeriesId || markers.length === 0) return

    const validMarkers = markers.filter((m) => m.end > m.start && m.title.trim())
    if (validMarkers.length === 0) {
      setError('All markers need a title and valid time range.')
      return
    }

    setSplitting(true)
    setError(null)

    try {
      const splitMarkers = validMarkers
        .sort((a, b) => a.start - b.start)
        .map((m) => ({ start: m.start, end: m.end, title: m.title.trim() }))

      await window.electronAPI.splitter.split(filePath, splitMarkers, selectedSeriesId)
      navigate(`/series/${selectedSeriesId}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSplitting(false)
    }
  }

  const regions: WaveformRegion[] = markers.map((m, i) => ({
    id: m.id,
    start: m.start,
    end: m.end,
    color: COLORS[i % COLORS.length],
    content: m.title,
  }))

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Splitting Editor</h1>
          <p className="text-sm text-muted-foreground truncate">{fileName}</p>
        </div>
      </div>

      {/* Waveform */}
      <div ref={waveformContainerRef}>
        <Waveform
          url={`file://${filePath}`}
          regions={regions}
          onReady={handleReady}
          onRegionUpdate={handleRegionUpdate}
          onTimeUpdate={handleTimeUpdate}
          onRegionClick={handleRegionClick}
          height={150}
        />
      </div>

      {/* Transport Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={controls.play}>
          <Play className="h-4 w-4" />
        </Button>
        <div className="text-sm text-muted-foreground font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={controls.zoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={controls.zoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button variant="outline" size="sm" onClick={splitAtCurrent}>
          <Scissors className="h-4 w-4 mr-1" />
          Split Here
        </Button>
        <Button variant="outline" size="sm" onClick={addMarkerAtCurrent}>
          <Plus className="h-4 w-4 mr-1" />
          Add Segment
        </Button>
      </div>

      {/* Segments List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Segments ({markers.length})</h2>
        <div className="space-y-2">
          {markers
            .sort((a, b) => a.start - b.start)
            .map((m, i) => (
              <Card
                key={m.id}
                className={`transition-colors ${selectedMarkerId === m.id ? 'border-primary' : ''}`}
                onClick={() => {
                  setSelectedMarkerId(m.id)
                  controls.seekTo(m.start)
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length].replace('0.2', '0.8') }}
                    />
                    <span className="text-sm text-muted-foreground w-6">{i + 1}</span>
                    <Input
                      value={m.title}
                      onChange={(e) => updateMarkerTitle(m.id, e.target.value)}
                      className="flex-1 h-8"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {formatDurationShort(m.start)} - {formatDurationShort(m.end)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono w-14 text-right">
                      {formatDurationShort(m.end - m.start)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeMarker(m.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex items-end gap-4">
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
          disabled={splitting || !selectedSeriesId || markers.length === 0}
        >
          <Scissors className="h-4 w-4 mr-2" />
          {splitting ? 'Splitting...' : `Split into ${markers.length} Episode${markers.length !== 1 ? 's' : ''}`}
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
