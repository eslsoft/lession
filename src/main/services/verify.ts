import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import OpenAI from 'openai'
import type { ServiceConfig } from '../../shared/types'

type VerifyResult = { ok: boolean; error?: string }

async function verifyElevenLabs(service: ServiceConfig): Promise<VerifyResult> {
  const apiKey = service.credentials.apiKey
  if (!apiKey) return { ok: false, error: 'API key is required' }
  try {
    const client = new ElevenLabsClient({ apiKey })
    await client.models.list()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function verifyOpenAI(service: ServiceConfig): Promise<VerifyResult> {
  const apiKey = service.credentials.apiKey
  if (!apiKey) return { ok: false, error: 'API key is required' }
  try {
    const client = new OpenAI({ apiKey })
    await client.models.list()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function verifyOpenAICompatible(service: ServiceConfig): Promise<VerifyResult> {
  const baseURL = service.options.baseUrl
  if (!baseURL) return { ok: false, error: 'Base URL is required' }
  try {
    const client = new OpenAI({
      apiKey: service.credentials.apiKey || 'not-needed',
      baseURL,
    })
    await client.models.list()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function verifyReplicate(service: ServiceConfig): Promise<VerifyResult> {
  const apiToken = service.credentials.apiToken
  if (!apiToken) return { ok: false, error: 'API token is required' }
  try {
    const res = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${body}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function verifyService(service: ServiceConfig): Promise<VerifyResult> {
  switch (service.provider) {
    case 'elevenlabs': return verifyElevenLabs(service)
    case 'openai': return verifyOpenAI(service)
    case 'openai_compatible': return verifyOpenAICompatible(service)
    case 'replicate': return verifyReplicate(service)
    default: return { ok: false, error: 'Verification not supported for this provider' }
  }
}
