import { describe, expect, it } from 'vitest'
import { parseWordTimedVtt } from '../word-timed-vtt'

const SAMPLE = `WEBVTT

00:00:05.757 --> 00:00:08.340
<00:00:05.757>The <00:00:05.917>revelation <00:00:06.718>of <00:00:06.898>Jesus <00:00:07.379>Christ,

00:00:08.500 --> 00:00:09.500
<00:00:08.500>Amen.
`

describe('parseWordTimedVtt', () => {
  it('maps cues and inline timestamps to segments and words', () => {
    const segments = parseWordTimedVtt(SAMPLE)

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      start: 5.757,
      end: 8.34,
      text: 'The revelation of Jesus Christ,',
      edited: false,
    })
    expect(segments[0].words).toEqual([
      { word: 'The', start: 5.757, end: 5.917, score: 0, normal: null, tags: null, chunk: null },
      { word: 'revelation', start: 5.917, end: 6.718, score: 0, normal: null, tags: null, chunk: null },
      { word: 'of', start: 6.718, end: 6.898, score: 0, normal: null, tags: null, chunk: null },
      { word: 'Jesus', start: 6.898, end: 7.379, score: 0, normal: null, tags: null, chunk: null },
      { word: 'Christ,', start: 7.379, end: 8.34, score: 0, normal: null, tags: null, chunk: null },
    ])
  })

  it('uses the cue end for its final word', () => {
    const segments = parseWordTimedVtt(SAMPLE)
    expect(segments[1].words[0].end).toBe(9.5)
  })

  it('rejects cues without word timestamps', () => {
    expect(() => parseWordTimedVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nPlain text'))
      .toThrow('VTT cue 1 has no word timestamps')
  })

  it('rejects word timestamps outside the cue', () => {
    expect(() => parseWordTimedVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<00:00:02.100>Late'))
      .toThrow('VTT cue 1 contains an invalid word time range')
  })
})
