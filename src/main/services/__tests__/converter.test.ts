import { describe, expect, it, vi } from 'vitest'
import { convertToM4a } from '../converter'

describe('convertToM4a', () => {
  it('returns M4B files unchanged', async () => {
    const onProgress = vi.fn()

    const result = await convertToM4a('/nonexistent/episode.m4b', '/unused', 60, onProgress)

    expect(result).toBe('/nonexistent/episode.m4b')
    expect(onProgress).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenCalledWith(100)
  })
})
