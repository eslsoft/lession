import { describe, expect, it } from 'vitest'
import { needsAudioConversion } from '../media-formats'

describe('needsAudioConversion', () => {
  it.each(['episode.m4a', 'episode.m4b', 'EPISODE.M4B'])(
    'does not convert directly usable MP4 audio: %s',
    (filePath) => expect(needsAudioConversion(filePath)).toBe(false),
  )

  it.each(['episode.mp3', 'episode.wav', 'episode.flac'])(
    'converts other audio formats: %s',
    (filePath) => expect(needsAudioConversion(filePath)).toBe(true),
  )
})
