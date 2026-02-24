import React from 'react'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'
import type { Segment, SegmentComplexity } from '../../../shared/types'

// Phrase type visual config (shared with TranscriptEditor for NLP annotations)
export const PHRASE_CONFIG: Record<string, { bg: string; underline: string; text: string; abbr: string }> = {
  NP:           { bg: 'bg-blue-50',    underline: 'bg-blue-400',    text: 'text-blue-600',    abbr: 'noun phrase'    },
  PV:           { bg: 'bg-green-50',   underline: 'bg-green-400',   text: 'text-green-600',   abbr: 'phrasal verb'   },
  Person:       { bg: 'bg-amber-50',   underline: 'bg-amber-400',   text: 'text-amber-600',   abbr: 'person'         },
  Place:        { bg: 'bg-purple-50',  underline: 'bg-purple-400',  text: 'text-purple-600',  abbr: 'place'          },
  Organization: { bg: 'bg-rose-50',    underline: 'bg-rose-400',    text: 'text-rose-600',    abbr: 'org'            },
  Event:        { bg: 'bg-teal-50',    underline: 'bg-teal-400',    text: 'text-teal-600',    abbr: 'event'          },
  Temporal:     { bg: 'bg-orange-50',  underline: 'bg-orange-400',  text: 'text-orange-600',  abbr: 'time'           },
}

// spaCy universal POS tags mapped to display labels
export const POS_DISPLAY: Record<string, string> = {
  NOUN: 'Noun',
  PROPN: 'Noun',
  VERB: 'Verb',
  AUX: 'Verb',
  ADJ: 'Adjective',
  ADV: 'Adverb',
  PRON: 'Pronoun',
  DET: 'Determiner',
  ADP: 'Preposition',
  CCONJ: 'Conjunction',
  SCONJ: 'Conjunction',
  NUM: 'Number',
  PART: 'Particle',
  INTJ: 'Interjection',
}

export function getPrimaryPOS(tags: string[] | null): string | null {
  if (!tags || tags.length === 0) return null
  // tags[0] is the universal POS (NOUN, VERB, etc.)
  return POS_DISPLAY[tags[0]] ?? null
}

const COMPLEXITY_COLORS: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-sky-100 text-sky-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-red-100 text-red-700',
}

function ComplexityBadge({ complexity }: { complexity: SegmentComplexity }) {
  const dots = '●'.repeat(complexity.score) + '○'.repeat(5 - complexity.score)
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', COMPLEXITY_COLORS[complexity.score])}>
      {dots} {complexity.label}
    </span>
  )
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface SegmentAnalysisPanelProps {
  segment: Segment | null
}

export default function SegmentAnalysisPanel({ segment }: SegmentAnalysisPanelProps) {
  if (!segment) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground p-4 text-center">
          No active segment. Play the audio to see analysis here.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {formatTimestamp(segment.start)} – {formatTimestamp(segment.end)}
        </span>
        {segment.complexity && <ComplexityBadge complexity={segment.complexity} />}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Phrases */}
          {(segment.phrases ?? []).length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Phrases
              </h4>
              <div className="space-y-1">
                {(segment.phrases ?? []).map((phrase, i) => {
                  const config = PHRASE_CONFIG[phrase.type]
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'shrink-0 text-[9px] font-bold px-1 py-0.5 rounded text-white',
                          config?.underline ?? 'bg-gray-400',
                        )}
                      >
                        {config?.abbr ?? phrase.type}
                      </span>
                      <span className="truncate">{phrase.text}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        [{phrase.startIdx}–{phrase.endIdx}]
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Word tokens */}
          {segment.words.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Words
              </h4>
              <div className="space-y-0.5">
                {segment.words.map((word, i) => {
                  const pos = getPrimaryPOS(word.tags)
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="font-medium w-24 truncate shrink-0">{word.word}</span>
                      <span className="text-muted-foreground truncate">{pos ?? ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
