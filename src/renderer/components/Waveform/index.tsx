import React, { useRef, useEffect, useCallback, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js'
import Zoom from 'wavesurfer.js/dist/plugins/zoom.esm.js'

export interface WaveformRegion {
  id: string
  start: number
  end: number
  color?: string
  content?: string
}

interface WaveformProps {
  url: string
  regions?: WaveformRegion[]
  onReady?: (duration: number) => void
  onRegionUpdate?: (id: string, start: number, end: number) => void
  onTimeUpdate?: (currentTime: number) => void
  onRegionClick?: (id: string) => void
  height?: number
}

export function Waveform({
  url,
  regions = [],
  onReady,
  onRegionUpdate,
  onTimeUpdate,
  onRegionClick,
  height = 128,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<ReturnType<typeof Regions.create> | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Initialize wavesurfer
  useEffect(() => {
    if (!containerRef.current) return

    const regionsPlugin = Regions.create()
    regionsPluginRef.current = regionsPlugin

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#a1a1aa',
      progressColor: '#fafafa',
      cursorColor: '#fafafa',
      cursorWidth: 1,
      height,
      minPxPerSec: 20,
      scrollParent: true,
      autoScroll: true,
      autoCenter: false,
      plugins: [
        regionsPlugin,
        Zoom.create({
          scale: 0.5,
          maxZoom: 500,
          exponentialZooming: true,
        }),
      ],
    })

    wsRef.current = ws

    ws.on('ready', () => {
      setIsReady(true)
      onReady?.(ws.getDuration())
    })

    ws.on('timeupdate', (time: number) => {
      onTimeUpdate?.(time)
    })

    regionsPlugin.on('region-updated', (region: { id: string; start: number; end: number }) => {
      onRegionUpdate?.(region.id, region.start, region.end)
    })

    regionsPlugin.on('region-clicked', (region: { id: string }, e: Event) => {
      e.stopPropagation()
      onRegionClick?.(region.id)
    })

    ws.load(url)

    return () => {
      ws.destroy()
      wsRef.current = null
      regionsPluginRef.current = null
      setIsReady(false)
    }
  }, [url, height])

  // Sync regions
  useEffect(() => {
    if (!isReady || !regionsPluginRef.current) return

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
  }, [regions, isReady])

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

  // Expose methods via ref-like pattern
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      (container as unknown as Record<string, unknown>).__waveformControls = { play, seekTo, zoomIn, zoomOut }
    }
  }, [play, seekTo, zoomIn, zoomOut])

  return (
    <div>
      <div ref={containerRef} className="w-full rounded-lg border border-border bg-card" />
    </div>
  )
}

export function useWaveformControls(ref: React.RefObject<HTMLDivElement | null>) {
  return {
    play: () => {
      const controls = (ref.current as unknown as Record<string, unknown>)?.__waveformControls as Record<string, () => void> | undefined
      controls?.play?.()
    },
    seekTo: (time: number) => {
      const controls = (ref.current as unknown as Record<string, unknown>)?.__waveformControls as Record<string, (t: number) => void> | undefined
      controls?.seekTo?.(time)
    },
    zoomIn: () => {
      const controls = (ref.current as unknown as Record<string, unknown>)?.__waveformControls as Record<string, () => void> | undefined
      controls?.zoomIn?.()
    },
    zoomOut: () => {
      const controls = (ref.current as unknown as Record<string, unknown>)?.__waveformControls as Record<string, () => void> | undefined
      controls?.zoomOut?.()
    },
  }
}
