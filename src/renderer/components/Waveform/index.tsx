import React, { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js'
import Zoom from 'wavesurfer.js/dist/plugins/zoom.esm.js'
import Hover from 'wavesurfer.js/dist/plugins/hover.esm.js'
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js'

export interface WaveformRegion {
  id: string
  start: number
  end: number
  color?: string
  content?: string
}

export interface SplitMarker {
  id: string
  time: number
}

export interface SegmentRegion {
  start: number
  end: number
  color: string
}

export interface WaveformHandle {
  play: () => void
  seekTo: (time: number) => void
  zoomIn: () => void
  zoomOut: () => void
}

interface WaveformProps {
  url?: string
  blob?: Blob
  peaks?: Float32Array
  mediaDuration?: number
  regions?: WaveformRegion[]
  splitMarkers?: SplitMarker[]
  segmentRegions?: SegmentRegion[]
  onReady?: (duration: number) => void
  onRegionUpdate?: (id: string, start: number, end: number) => void
  onTimeUpdate?: (currentTime: number) => void
  onRegionClick?: (id: string) => void
  onWaveformDblClick?: (time: number) => void
  onSplitMarkerDrag?: (id: string, newTime: number) => void
  onPlayPause?: (isPlaying: boolean) => void
  height?: number
}

function formatTimeLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const Waveform = forwardRef<WaveformHandle, WaveformProps>(function Waveform({
  url,
  blob,
  peaks,
  mediaDuration,
  regions = [],
  splitMarkers,
  segmentRegions,
  onReady,
  onRegionUpdate,
  onTimeUpdate,
  onRegionClick,
  onWaveformDblClick,
  onSplitMarkerDrag,
  onPlayPause,
  height = 128,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<ReturnType<typeof Regions.create> | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Store callbacks in refs to avoid re-creating wavesurfer
  const onWaveformDblClickRef = useRef(onWaveformDblClick)
  onWaveformDblClickRef.current = onWaveformDblClick
  const onSplitMarkerDragRef = useRef(onSplitMarkerDrag)
  onSplitMarkerDragRef.current = onSplitMarkerDrag

  const play = useCallback(() => {
    wsRef.current?.playPause()
  }, [])

  const seekTo = useCallback((time: number) => {
    if (!wsRef.current) return
    const duration = wsRef.current.getDuration()
    if (duration > 0) {
      wsRef.current.seekTo(time / duration)
    }
  }, [])

  const zoomIn = useCallback(() => {
    if (!wsRef.current) return
    const current = wsRef.current.options.minPxPerSec || 20
    wsRef.current.zoom(Math.min(current * 2, 500))
  }, [])

  const zoomOut = useCallback(() => {
    if (!wsRef.current) return
    const current = wsRef.current.options.minPxPerSec || 20
    wsRef.current.zoom(Math.max(current / 2, 5))
  }, [])

  useImperativeHandle(ref, () => ({ play, seekTo, zoomIn, zoomOut }), [play, seekTo, zoomIn, zoomOut])

  // Initialize wavesurfer
  useEffect(() => {
    if (!containerRef.current) return

    const regionsPlugin = Regions.create()
    regionsPluginRef.current = regionsPlugin

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#a1a1aa',
      progressColor: '#fafafa',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      height,
      minPxPerSec: 20,
      // @ts-expect-error scrollParent is supported at runtime but missing from types
      scrollParent: true,
      autoScroll: true,
      autoCenter: false,
      plugins: [
        regionsPlugin,
        Hover.create({
          lineColor: '#ef4444',
          lineWidth: 1,
          labelSize: 11,
          labelBackground: 'rgba(0, 0, 0, 0.75)',
          labelColor: '#fff',
          formatTimeCallback: formatTimeLabel,
        }),
        Timeline.create({
          height: 24,
          formatTimeCallback: formatTimeLabel,
          secondaryLabelOpacity: 0.4,
        }),
      ],
    })

    wsRef.current = ws

    ws.on('ready', () => {
      // Register Zoom plugin only after audio is loaded to avoid
      // "No audio loaded" errors from wheel events during loading
      ws.registerPlugin(Zoom.create({
        scale: 0.5,
        maxZoom: 500,
        exponentialZooming: true,
      }))
      setIsReady(true)
      onReady?.(ws.getDuration())
    })

    ws.on('play', () => onPlayPause?.(true))
    ws.on('pause', () => onPlayPause?.(false))

    ws.on('timeupdate', (time: number) => {
      onTimeUpdate?.(time)
    })

    ws.on('dblclick', (relativeX: number) => {
      const time = relativeX * ws.getDuration()
      onWaveformDblClickRef.current?.(time)
    })

    regionsPlugin.on('region-updated', (region: { id: string; start: number; end: number }) => {
      // Split marker drag: point markers have start === end
      if (region.id.startsWith('split-') && region.start === region.end) {
        onSplitMarkerDragRef.current?.(region.id, region.start)
      } else {
        onRegionUpdate?.(region.id, region.start, region.end)
      }
    })

    regionsPlugin.on('region-clicked', (region: { id: string }, e: Event) => {
      // Only stop propagation for interactive split markers
      // Let background segment region clicks propagate for waveform seek
      if (region.id.startsWith('split-')) {
        e.stopPropagation()
        onRegionClick?.(region.id)
      }
    })

    if (peaks && url) {
      // Pre-computed peaks: skip browser-side decoding, stream audio for playback
      ws.load(url, [peaks], mediaDuration)
    } else if (blob) {
      ws.loadBlob(blob)
    } else if (url) {
      ws.load(url)
    }

    return () => {
      ws.destroy()
      wsRef.current = null
      regionsPluginRef.current = null
      setIsReady(false)
    }
  }, [url, blob, peaks, mediaDuration, height])

  // Sync split markers and segment regions (new mode)
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current || (!splitMarkers && !segmentRegions)) return

    const plugin = regionsPluginRef.current
    plugin.clearRegions()

    // Add segment background regions (non-draggable)
    if (segmentRegions) {
      for (const seg of segmentRegions) {
        plugin.addRegion({
          start: seg.start,
          end: seg.end,
          color: seg.color,
          drag: false,
          resize: false,
        })
      }
    }

    // Add split point markers (draggable red lines)
    if (splitMarkers) {
      for (const marker of splitMarkers) {
        plugin.addRegion({
          id: marker.id,
          start: marker.time,
          color: '#ef4444',
          drag: true,
          resize: false,
        })
      }
    }
  }, [splitMarkers, segmentRegions, isReady])

  // Sync legacy regions (backward compat)
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current || splitMarkers || segmentRegions) return

    const plugin = regionsPluginRef.current
    plugin.clearRegions()

    for (const r of regions) {
      plugin.addRegion({
        id: r.id,
        start: r.start,
        end: r.end,
        color: r.color ?? 'rgba(99, 102, 241, 0.2)',
        content: r.content,
        drag: true,
        resize: true,
      })
    }
  }, [regions, isReady, splitMarkers, segmentRegions])

  return (
    <div>
      <div ref={containerRef} className="w-full rounded-lg border border-border bg-card" />
    </div>
  )
})
