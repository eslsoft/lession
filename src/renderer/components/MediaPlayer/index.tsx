import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export interface MediaPlayerRef {
  seekTo: (time: number) => void
  play: () => void
  pause: () => void
  getCurrentTime: () => number
}

interface MediaPlayerProps {
  src: string
  mimeType: 'audio' | 'video'
  onTimeUpdate?: (currentTime: number) => void
  onDurationChange?: (duration: number) => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const MediaPlayer = forwardRef<MediaPlayerRef, MediaPlayerProps>(
  ({ src, mimeType, onTimeUpdate, onDurationChange }, ref) => {
    const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [playbackRate, setPlaybackRate] = useState(1)

    useImperativeHandle(ref, () => ({
      seekTo: (time: number) => {
        if (mediaRef.current) {
          mediaRef.current.currentTime = time
        }
      },
      play: () => {
        mediaRef.current?.play()
      },
      pause: () => {
        mediaRef.current?.pause()
      },
      getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
    }))

    const handleTimeUpdate = useCallback(() => {
      if (mediaRef.current) {
        const t = mediaRef.current.currentTime
        setCurrentTime(t)
        onTimeUpdate?.(t)
      }
    }, [onTimeUpdate])

    const handleDurationChange = useCallback(() => {
      if (mediaRef.current) {
        const d = mediaRef.current.duration
        setDuration(d)
        onDurationChange?.(d)
      }
    }, [onDurationChange])

    const handlePlay = useCallback(() => setPlaying(true), [])
    const handlePause = useCallback(() => setPlaying(false), [])

    const togglePlay = useCallback(() => {
      if (!mediaRef.current) return
      if (playing) {
        mediaRef.current.pause()
      } else {
        mediaRef.current.play()
      }
    }, [playing])

    const handleProgressClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressRef.current || !mediaRef.current || !duration) return
        const rect = progressRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        mediaRef.current.currentTime = ratio * duration
      },
      [duration]
    )

    const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value)
      setVolume(v)
      if (mediaRef.current) {
        mediaRef.current.volume = v
        mediaRef.current.muted = false
      }
      setMuted(false)
    }, [])

    const toggleMute = useCallback(() => {
      if (mediaRef.current) {
        mediaRef.current.muted = !muted
        setMuted(!muted)
      }
    }, [muted])

    const cyclePlaybackRate = useCallback(() => {
      const idx = PLAYBACK_RATES.indexOf(playbackRate)
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]
      setPlaybackRate(next)
      if (mediaRef.current) {
        mediaRef.current.playbackRate = next
      }
    }, [playbackRate])

    useEffect(() => {
      const el = mediaRef.current
      if (!el) return
      el.volume = volume
      el.playbackRate = playbackRate
    }, [src])

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    const mediaProps = {
      ref: mediaRef as React.RefObject<HTMLAudioElement & HTMLVideoElement>,
      src,
      onTimeUpdate: handleTimeUpdate,
      onDurationChange: handleDurationChange,
      onPlay: handlePlay,
      onPause: handlePause,
      onEnded: handlePause,
      preload: 'metadata' as const,
    }

    return (
      <div className="w-full">
        {mimeType === 'video' ? (
          <video
            {...mediaProps}
            className="w-full max-h-[400px] bg-black rounded-t-lg"
          />
        ) : (
          <audio {...mediaProps} className="hidden" />
        )}

        <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            className="shrink-0"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          <span className="text-xs text-muted-foreground tabular-nums w-[44px] text-right shrink-0">
            {formatTime(currentTime)}
          </span>

          <div
            ref={progressRef}
            className="flex-1 h-2 bg-primary/20 rounded-full cursor-pointer relative group"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          <span className="text-xs text-muted-foreground tabular-nums w-[44px] shrink-0">
            {formatTime(duration)}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8">
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 accent-primary cursor-pointer"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={cyclePlaybackRate}
            className="shrink-0 text-xs tabular-nums w-[44px]"
          >
            {playbackRate}x
          </Button>
        </div>
      </div>
    )
  }
)

MediaPlayer.displayName = 'MediaPlayer'

export default MediaPlayer
