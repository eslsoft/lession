import React, { useState, useEffect, useRef, useCallback } from 'react'
import { User, Eye, Scissors } from 'lucide-react'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'
import { PHRASE_CONFIG } from '../SegmentAnalysisPanel'
import type { Transcript, Segment, WordToken } from '../../../shared/types'

// Text-only colors for complexity dots (no background)
const COMPLEXITY_DOT_COLORS: Record<number, string> = {
  1: 'text-emerald-700',
  2: 'text-sky-700',
  3: 'text-amber-700',
  4: 'text-orange-700',
  5: 'text-red-700',
}

// Build a map from word index to phrase for quick lookup
function buildPhraseMap(phrases: Segment['phrases']): Map<number, { type: string; startIdx: number; endIdx: number }> {
  const map = new Map<number, { type: string; startIdx: number; endIdx: number }>()
  if (!phrases) return map
  for (const phrase of phrases) {
    for (let i = phrase.startIdx; i <= phrase.endIdx; i++) {
      map.set(i, phrase)
    }
  }
  return map
}

// ── NLP Annotated Segment ────────────────────────────────────────────────────

function NlpAnnotatedSegment({
  words,
  phrases,
  activeWordIndex,
  isActive,
}: {
  words: WordToken[]
  phrases: Segment['phrases']
  activeWordIndex: number
  isActive: boolean
}) {
  const phraseMap = buildPhraseMap(phrases)

  const elements: React.ReactNode[] = []
  let i = 0
  while (i < words.length) {
    const phrase = phraseMap.get(i)
    if (phrase && i === phrase.startIdx) {
      // Render a phrase group
      const config = PHRASE_CONFIG[phrase.type]
      const phraseWords = words.slice(phrase.startIdx, phrase.endIdx + 1)
      elements.push(
        <span
          key={`phrase-${i}`}
          className="inline-flex flex-col items-center mx-0.5"
        >
          <span className="flex flex-wrap gap-x-1">
            {phraseWords.map((word, wi) => {
              const wordIdx = phrase.startIdx + wi
              const isActiveWord = wordIdx === activeWordIndex && isActive
              return (
                <span
                  key={wi}
                  className={cn(
                    'text-sm leading-snug',
                    isActiveWord && 'text-red-500',
                  )}
                >
                  {word.word}
                </span>
              )
            })}
          </span>
          {config && (
            <span className={cn('h-[2px] w-full rounded-full mt-0.5', config.underline)} />
          )}
        </span>,
      )
      i = phrase.endIdx + 1
    } else {
      // Standalone word
      const isActiveWord = i === activeWordIndex && isActive
      elements.push(
        <span
          key={`word-${i}`}
          className="inline-flex flex-col items-center mx-0.5"
        >
          <span
            className={cn(
              'text-sm leading-snug',
              isActiveWord && 'text-red-500',
            )}
          >
            {words[i].word}
          </span>
          <span className="h-[2px] w-full mt-0.5" />
        </span>,
      )
      i++
    }
  }

  return <div className="flex flex-wrap items-end">{elements}</div>
}

// ── Split Mode Segment ──────────────────────────────────────────────────────

function SplitModeSegment({
  words,
  onWordClick,
}: {
  words: WordToken[]
  onWordClick: (wordIndex: number) => void
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  return (
    <div className="flex flex-wrap items-center gap-y-1">
      {words.map((word, wi) => (
        <React.Fragment key={wi}>
          {/* Divider before each word (except the first) */}
          {wi > 0 && (
            <span
              className={cn(
                'inline-block w-0.5 h-5 mx-0.5 rounded-full transition-colors',
                hoverIndex === wi ? 'bg-red-500' : 'bg-border',
              )}
            />
          )}
          <span
            className={cn(
              'text-sm leading-snug px-0.5 py-0.5 rounded cursor-pointer transition-colors',
              hoverIndex === wi
                ? 'bg-red-100 text-red-700'
                : 'hover:bg-accent',
            )}
            onMouseEnter={() => setHoverIndex(wi)}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={(e) => {
              e.stopPropagation()
              if (wi > 0) onWordClick(wi)
            }}
            title={wi > 0 ? `Split here: "${words.slice(wi).map(w => w.word).join(' ')}" becomes new segment` : 'Cannot split before first word'}
          >
            {word.word}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

interface TranscriptEditorProps {
  transcript: Transcript | null
  currentTime: number
  onSeek?: (time: number) => void
  onSegmentEdit?: (segmentIndex: number, text: string) => void
  onSegmentSplit?: (segmentIndex: number, wordIndex: number) => void
  onActiveSegmentChange?: (segment: Segment | null) => void
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function findActiveSegmentIndex(segments: Segment[], currentTime: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (currentTime >= segments[i].start && currentTime <= segments[i].end) return i
    // Fill gaps: time is between this segment's end and next segment's start
    if (
      i < segments.length - 1 &&
      currentTime > segments[i].end &&
      currentTime < segments[i + 1].start
    ) {
      return i
    }
  }
  return -1
}

function findActiveWordIndex(segment: Segment, currentTime: number): number {
  const words = segment.words
  for (let i = 0; i < words.length; i++) {
    if (currentTime >= words[i].start && currentTime <= words[i].end) return i
    // Fill gaps: time is between previous word's end and this word's start
    if (i > 0 && currentTime > words[i - 1].end && currentTime < words[i].start) return i
  }
  return -1
}

export default function TranscriptEditor({
  transcript,
  currentTime,
  onSeek,
  onSegmentEdit,
  onSegmentSplit,
  onActiveSegmentChange,
}: TranscriptEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [nlpHighlight, setNlpHighlight] = useState(false)
  const [splittingIndex, setSplittingIndex] = useState<number | null>(null)
  const activeSegRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const segments = transcript?.segments ?? []
  const activeSegmentIndex = findActiveSegmentIndex(segments, currentTime)

  // Notify parent when active segment changes
  useEffect(() => {
    if (!onActiveSegmentChange) return
    if (activeSegmentIndex >= 0 && activeSegmentIndex < segments.length) {
      onActiveSegmentChange(segments[activeSegmentIndex])
    } else {
      onActiveSegmentChange(null)
    }
  }, [activeSegmentIndex, segments, onActiveSegmentChange])

  useEffect(() => {
    if (activeSegRef.current) {
      activeSegRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeSegmentIndex])

  const startEditing = useCallback((index: number, text: string) => {
    setEditingIndex(index)
    setEditText(text)
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingIndex(null)
    setEditText('')
  }, [])

  const saveEditing = useCallback(() => {
    if (editingIndex !== null && onSegmentEdit) {
      onSegmentEdit(editingIndex, editText)
    }
    setEditingIndex(null)
    setEditText('')
  }, [editingIndex, editText, onSegmentEdit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') cancelEditing()
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        saveEditing()
      }
    },
    [cancelEditing, saveEditing],
  )

  // Exit split mode on Escape
  useEffect(() => {
    if (splittingIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSplittingIndex(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [splittingIndex])

  const handleSplitWordClick = useCallback(
    (segmentIndex: number, wordIndex: number) => {
      onSegmentSplit?.(segmentIndex, wordIndex)
      setSplittingIndex(null)
    },
    [onSegmentSplit],
  )

  if (!transcript || segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8 text-center">
        No transcript available. Click Transcribe to generate one.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium">
          Transcript
          <span className="ml-2 text-muted-foreground font-normal">{segments.length} segments</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant={nlpHighlight ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setNlpHighlight(!nlpHighlight)}
            title="Toggle NLP annotation"
          >
            <Eye className="h-3 w-3 mr-1" />
            NLP
          </Button>
        </div>
      </div>

      {/* NLP Legend */}
      {nlpHighlight && (
        <div className="flex flex-wrap gap-3 px-4 py-1.5 border-b border-border/50 shrink-0">
          {Object.entries(PHRASE_CONFIG).map(([key, config]) => (
            <span key={key} className="flex items-center gap-1 text-xs">
              <span className={cn('inline-block h-1.5 w-5 rounded-full', config.underline)} />
              <span className={config.text}>{config.abbr}</span>
            </span>
          ))}
        </div>
      )}

      {/* Segments */}
      <ScrollArea className="flex-1 min-h-0" ref={containerRef}>
        <div>
          {segments.map((segment, index) => {
            const isActive = index === activeSegmentIndex
            const isEditing = index === editingIndex
            const isSplitting = index === splittingIndex
            const activeWordIndex = isActive ? findActiveWordIndex(segment, currentTime) : -1
            const canSplit = segment.words && segment.words.length > 1

            return (
              <div
                key={index}
                ref={isActive ? activeSegRef : undefined}
                className={cn(
                  'group px-4 py-3 border-b border-border/50 cursor-pointer transition-colors',
                  isActive ? 'bg-accent/50' : 'hover:bg-accent/20',
                  isSplitting && 'ring-2 ring-inset ring-orange-400 bg-orange-50/50',
                )}
                onClick={() => {
                  if (!isEditing && !isSplitting) {
                    onSeek?.(segment.start)
                  }
                }}
                onDoubleClick={() => {
                  if (!isEditing && !isSplitting && onSegmentEdit) {
                    startEditing(index, segment.text)
                  }
                }}
              >
                {/* Timestamp + split button + speaker + complexity */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                  </span>
                  {canSplit && onSegmentSplit && (
                    <button
                      type="button"
                      className={cn(
                        'p-0.5 rounded transition-colors',
                        isSplitting
                          ? 'text-orange-600 bg-orange-100'
                          : 'text-muted-foreground/0 group-hover:text-muted-foreground hover:text-foreground hover:bg-accent',
                      )}
                      title={isSplitting ? 'Click a word to split (Esc to cancel)' : 'Split segment'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSplittingIndex(isSplitting ? null : index)
                      }}
                    >
                      <Scissors className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {segment.speaker && (
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <User className="h-3 w-3" />
                      {segment.speaker}
                    </span>
                  )}
                  <span className="flex-1" />
                  {segment.complexity && (
                    <span className={cn('text-[10px] leading-none', COMPLEXITY_DOT_COLORS[segment.complexity.score])}>
                      {'●'.repeat(segment.complexity.score)}{'○'.repeat(5 - segment.complexity.score)}
                    </span>
                  )}
                </div>

                {/* Content */}
                {isEditing ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={cancelEditing}
                      rows={3}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">Enter to save, Esc to cancel</p>
                  </div>
                ) : isSplitting && segment.words.length > 0 ? (
                  // Split mode: clickable words with dividers
                  <div onClick={(e) => e.stopPropagation()}>
                    <SplitModeSegment
                      words={segment.words}
                      onWordClick={(wordIndex) => handleSplitWordClick(index, wordIndex)}
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Click a word to make it the start of a new segment. <span className="text-muted-foreground/70">Esc to cancel</span>
                    </p>
                  </div>
                ) : nlpHighlight && segment.words.length > 0 ? (
                  // NLP annotation: phrase-level underline brackets
                  <NlpAnnotatedSegment
                    words={segment.words}
                    phrases={segment.phrases}
                    activeWordIndex={activeWordIndex}
                    isActive={isActive}
                  />
                ) : isActive && segment.words.length > 0 ? (
                  // Word-level highlight for active segment
                  <p className="text-sm leading-relaxed">
                    {segment.words.map((word, wi) => (
                      <span
                        key={wi}
                        className={cn(wi === activeWordIndex && 'text-red-500')}
                      >
                        {word.word}{wi < segment.words.length - 1 ? ' ' : ''}
                      </span>
                    ))}
                  </p>
                ) : (
                  // Plain text
                  <p className="text-sm leading-relaxed">{segment.text}</p>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
