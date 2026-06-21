import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListMusic, Plus, Play, X } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { Chapter } from '../../../shared/types'
import { formatDuration } from './utils'

interface ChaptersPanelProps {
  chapters: Chapter[]
  duration?: number
  currentTime: number
  onSeek: (time: number) => void
  onChange: (chapters: Chapter[]) => void
}

// Chapters are contiguous navigation markers: each chapter ends where the next
// one begins. Ends are derived from the sorted starts plus the media duration,
// so add/delete only ever needs to track starts and titles.
function normalize(chapters: Chapter[], duration: number): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.start - b.start)
  return sorted.map((ch, i) => ({
    ...ch,
    end: i < sorted.length - 1 ? sorted[i + 1].start : (duration || ch.end),
  }))
}

export default function ChaptersPanel({ chapters, duration, currentTime, onSeek, onChange }: ChaptersPanelProps) {
  const [collapsed, setCollapsed] = useState(chapters.length === 0)

  const activeIndex = useMemo(() => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentTime >= chapters[i].start) return i
    }
    return -1
  }, [chapters, currentTime])

  const addAtPlayhead = () => {
    const start = Math.max(0, Math.floor(currentTime))
    if (chapters.some((ch) => Math.abs(ch.start - start) < 0.5)) return
    const next = normalize(
      [...chapters, { title: `Chapter ${chapters.length + 1}`, start, end: start }],
      duration ?? 0,
    )
    onChange(next)
  }

  const removeChapter = (index: number) => {
    onChange(normalize(chapters.filter((_, i) => i !== index), duration ?? 0))
  }

  const renameChapter = (index: number, title: string) => {
    onChange(chapters.map((ch, i) => (i === index ? { ...ch, title } : ch)))
  }

  return (
    <div className="rounded-lg border border-border bg-card shrink-0">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          className="flex items-center gap-2 text-sm font-medium"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <ListMusic className="h-4 w-4 text-muted-foreground" />
          Chapters
          <span className="text-xs text-muted-foreground font-normal">({chapters.length})</span>
        </button>
        <Button variant="outline" size="sm" className="h-7" onClick={addAtPlayhead}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add at {formatDuration(currentTime)}
        </Button>
      </div>

      {!collapsed && (
        <div className="max-h-48 overflow-y-auto border-t border-border divide-y divide-border">
          {chapters.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No chapters. Play to a position and click “Add” to mark a chapter.
            </p>
          ) : (
            chapters.map((ch, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${
                  i === activeIndex ? 'bg-accent/50' : 'hover:bg-muted/30'
                }`}
              >
                <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
                  {i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onSeek(ch.start)}
                  title="Jump to chapter"
                >
                  <Play className="h-3 w-3" />
                </Button>
                <Input
                  value={ch.title}
                  onChange={(e) => renameChapter(i, e.target.value)}
                  className="h-7 text-sm flex-1"
                />
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {formatDuration(ch.start)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeChapter(i)}
                  title="Remove chapter"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
