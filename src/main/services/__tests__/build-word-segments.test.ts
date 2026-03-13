import { describe, it, expect } from 'vitest'
import { buildWordSegments } from '../tts/elevenlabs'

type Alignment = {
  characters: string[]
  characterStartTimesSeconds: number[]
  characterEndTimesSeconds: number[]
}

function makeAlignment(text: string, charDuration = 0.1): Alignment {
  const chars = text.split('')
  const starts: number[] = []
  const ends: number[] = []
  let t = 0
  for (const _ of chars) {
    starts.push(t)
    ends.push(t + charDuration)
    t += charDuration
  }
  return { characters: chars, characterStartTimesSeconds: starts, characterEndTimesSeconds: ends }
}

describe('buildWordSegments', () => {
  it('should split words on spaces', () => {
    const alignment = makeAlignment('Hello world')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['Hello', 'world'])
  })

  it('should split words on newlines', () => {
    const alignment = makeAlignment('FOREWORD\n\nTRANSLATED')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['FOREWORD', 'TRANSLATED'])
  })

  it('should split words on mixed whitespace', () => {
    const alignment = makeAlignment('LANPHIER\n\nThis anthology')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['LANPHIER', 'This', 'anthology'])
  })

  it('should handle single word', () => {
    const alignment = makeAlignment('Hello')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['Hello'])
  })

  it('should handle consecutive whitespace', () => {
    const alignment = makeAlignment('a   b')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['a', 'b'])
  })

  it('should handle trailing whitespace', () => {
    const alignment = makeAlignment('hello ')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['hello'])
  })

  it('should handle leading whitespace', () => {
    const alignment = makeAlignment(' hello')
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['hello'])
  })

  it('should apply time offset', () => {
    const alignment = makeAlignment('Hi')
    const segments = buildWordSegments(alignment, 5.0)
    expect(segments[0].start).toBeCloseTo(5.0)
    expect(segments[0].end).toBeCloseTo(5.2)
  })

  it('should return empty for undefined alignment', () => {
    const segments = buildWordSegments(undefined, 0)
    expect(segments).toEqual([])
  })

  it('should handle multi-char elements containing newlines', () => {
    // Simulate API returning characters where newlines are embedded in elements
    const alignment: Alignment = {
      characters: ['F','O','R','E','W','O','R','D','\n','\n','T','R','A','N','S','L','A','T','E','D'],
      characterStartTimesSeconds: [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9],
      characterEndTimesSeconds:   [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0],
    }
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['FOREWORD', 'TRANSLATED'])
  })

  it('should handle when newline is part of a multi-char string element', () => {
    // What if the API returns '\n\n' as a single element?
    const alignment: Alignment = {
      characters: ['F','O','R','E','W','O','R','D','\n\n','T','R','A','N','S','L','A','T','E','D'],
      characterStartTimesSeconds: [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9],
      characterEndTimesSeconds:   [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0],
    }
    const segments = buildWordSegments(alignment, 0)
    expect(segments.map((s) => s.text)).toEqual(['FOREWORD', 'TRANSLATED'])
  })
})
