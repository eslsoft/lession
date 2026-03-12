import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, CheckCircle, XCircle, Loader2, HardDrive, Download, X, Terminal, Server, Plus, Pencil, Trash2, Volume2, Play, Square } from 'lucide-react'
import { useConfigStore } from '../../stores/configStore'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'
import type { AppConfig, ServiceConfig, ServiceProvider, TtsEngine, TranscriptionEngine } from '../../../shared/types'
import { BUILTIN_SERVICES } from '../../../shared/types'
import { getEngineLabel, PROVIDER_LABELS } from '../../../shared/engines'
import type { SelectOption } from '../../../shared/engines'
import EnvironmentStatus from '../../components/EnvironmentStatus'

const defaultConfig: AppConfig = {
  storage: {
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicBaseUrl: '',
  },
  import: {
    ytdlpPath: '',
    downloadDir: '',
  },
  services: [...BUILTIN_SERVICES],
}

type Section = 'storage' | 'services' | 'import' | 'environment'

const sections = [
  { id: 'storage' as Section, label: 'Storage', icon: HardDrive },
  { id: 'services' as Section, label: 'Services', icon: Server },
  { id: 'import' as Section, label: 'Import', icon: Download },
  { id: 'environment' as Section, label: 'Environment', icon: Terminal },
]

/** Available providers for adding new TTS services (built-in local ones are pre-configured). */
const TTS_ADD_OPTIONS: { provider: ServiceProvider; engine: TtsEngine; label: string }[] = [
  { provider: 'elevenlabs', engine: 'elevenlabs', label: 'ElevenLabs' },
  { provider: 'openai', engine: 'openai', label: 'OpenAI TTS' },
  { provider: 'openai_compatible', engine: 'openai_compatible', label: 'OpenAI Compatible' },
]

const TRANSCRIPTION_ADD_OPTIONS: { provider: ServiceProvider; engine: TranscriptionEngine; label: string }[] = [
  { provider: 'replicate', engine: 'whisperx', label: 'Replicate' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function defaultServiceName(engine: string): string {
  return getEngineLabel(engine)
}

export default function SetupDialog({ open, onOpenChange }: Props) {
  const { config, saveConfig, testS3Connection } = useConfigStore()
  const isFirstTime = !config

  const [activeSection, setActiveSection] = useState<Section>('storage')
  const [form, setForm] = useState<AppConfig>(config ?? defaultConfig)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  // Service editor state
  const [editingService, setEditingService] = useState<ServiceConfig | null>(null)
  const [addingCategory, setAddingCategory] = useState<'tts' | 'transcription' | null>(null)

  useEffect(() => {
    if (config) setForm({ ...defaultConfig, ...config })
  }, [config])

  function updateStorage<K extends keyof AppConfig['storage']>(key: K, value: AppConfig['storage'][K]) {
    setForm((prev) => ({ ...prev, storage: { ...prev.storage, [key]: value } }))
    setTestResult(null)
  }

  function updateImport<K extends keyof AppConfig['import']>(key: K, value: AppConfig['import'][K]) {
    setForm((prev) => ({ ...prev, import: { ...prev.import, [key]: value } }))
  }

  function saveService(service: ServiceConfig) {
    setForm((prev) => {
      const existing = prev.services.findIndex((s) => s.id === service.id)
      const services = [...prev.services]
      if (existing >= 0) {
        services[existing] = service
      } else {
        services.push(service)
      }
      return { ...prev, services }
    })
    setEditingService(null)
    setAddingCategory(null)
  }

  function removeService(id: string) {
    // Prevent removing builtin services
    const service = form.services.find((s) => s.id === id)
    if (service?.builtin) return
    setForm((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s.id !== id),
    }))
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await testS3Connection(form.storage)
      setTestResult(ok)
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveConfig(form)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSelectDirectory() {
    const result = await window.electronAPI.dialog.openDirectory()
    if (result) updateImport('downloadDir', result)
  }

  const ttsServices = form.services.filter((s) => s.category === 'tts')
  const transcriptionServices = form.services.filter((s) => s.category === 'transcription')

  return (
    <Dialog open={open} onOpenChange={isFirstTime ? () => { /* noop */ } : onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        {/* Header */}
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border px-4">
          <span className="font-semibold text-sm">
            {isFirstTime ? 'Welcome to Lession' : 'Settings'}
          </span>
          {!isFirstTime && (
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm p-1 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex h-[560px]">
          {/* Left sidebar */}
          <aside className="flex w-44 flex-shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-3">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left',
                  activeSection === id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </aside>

          {/* Right content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6">
              {activeSection === 'storage' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="endpoint">Endpoint</Label>
                      <Input
                        id="endpoint"
                        placeholder="https://s3.amazonaws.com"
                        value={form.storage.endpoint}
                        onChange={(e) => updateStorage('endpoint', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="region">Region</Label>
                      <Input
                        id="region"
                        placeholder="us-east-1"
                        value={form.storage.region}
                        onChange={(e) => updateStorage('region', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bucket">Bucket</Label>
                    <Input
                      id="bucket"
                      placeholder="my-content-bucket"
                      value={form.storage.bucket}
                      onChange={(e) => updateStorage('bucket', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="accessKeyId">Access Key ID</Label>
                      <Input
                        id="accessKeyId"
                        placeholder="AKIA..."
                        value={form.storage.accessKeyId}
                        onChange={(e) => updateStorage('accessKeyId', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secretAccessKey">Secret Access Key</Label>
                      <Input
                        id="secretAccessKey"
                        type="password"
                        placeholder="********"
                        value={form.storage.secretAccessKey}
                        onChange={(e) => updateStorage('secretAccessKey', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publicBaseUrl">Public Base URL</Label>
                    <Input
                      id="publicBaseUrl"
                      placeholder="https://cdn.example.com"
                      value={form.storage.publicBaseUrl}
                      onChange={(e) => updateStorage('publicBaseUrl', e.target.value)}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={testing || !form.storage.endpoint || !form.storage.bucket}
                    >
                      {testing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Test Connection
                    </Button>
                    {testResult === true && (
                      <span className="flex items-center gap-1 text-sm text-green-500">
                        <CheckCircle className="h-4 w-4" /> Connection successful
                      </span>
                    )}
                    {testResult === false && (
                      <span className="flex items-center gap-1 text-sm text-red-500">
                        <XCircle className="h-4 w-4" /> Connection failed
                      </span>
                    )}
                  </div>
                </div>
              )}

              {activeSection === 'services' && (
                <div className="space-y-6">
                  {/* Editing / Adding a service */}
                  {(editingService || addingCategory) ? (
                    <ServiceEditor
                      service={editingService}
                      category={addingCategory ?? editingService!.category}
                      onSave={saveService}
                      onCancel={() => { setEditingService(null); setAddingCategory(null) }}
                    />
                  ) : (
                    <>
                      {/* TTS Services */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium">TTS Services</h3>
                          <Button variant="outline" size="sm" onClick={() => setAddingCategory('tts')}>
                            <Plus className="mr-1 h-3 w-3" /> Add
                          </Button>
                        </div>
                        {ttsServices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                            No TTS services configured
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {ttsServices.map((s) => (
                              <ServiceRow
                                key={s.id}
                                service={s}
                                onEdit={() => setEditingService(s)}
                                onRemove={() => removeService(s.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Transcription Services */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium">Transcription Services</h3>
                          <Button variant="outline" size="sm" onClick={() => setAddingCategory('transcription')}>
                            <Plus className="mr-1 h-3 w-3" /> Add
                          </Button>
                        </div>
                        {transcriptionServices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3 text-center border rounded-lg border-dashed">
                            No transcription services configured
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {transcriptionServices.map((s) => (
                              <ServiceRow
                                key={s.id}
                                service={s}
                                onEdit={() => setEditingService(s)}
                                onRemove={() => removeService(s.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeSection === 'import' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="downloadDir">Download Directory</Label>
                    <div className="flex gap-2">
                      <Input
                        id="downloadDir"
                        placeholder="/Users/you/Downloads"
                        value={form.import.downloadDir}
                        onChange={(e) => updateImport('downloadDir', e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={handleSelectDirectory}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'environment' && (
                <EnvironmentStatus />
              )}
            </div>

            {/* Footer — hidden when editing a service (ServiceEditor has its own buttons) */}
            {!(activeSection === 'services' && (editingService || addingCategory)) && (
              <div className="flex flex-shrink-0 justify-end border-t border-border px-6 py-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isFirstTime ? 'Save & Get Started' : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Service Row ──

function isServiceConfigured(service: ServiceConfig): boolean {
  if (service.provider === 'local') return true
  if (['elevenlabs', 'openai'].includes(service.provider)) return !!service.credentials.apiKey
  if (service.provider === 'replicate') return !!service.credentials.apiToken
  if (service.provider === 'openai_compatible') return !!service.options.baseUrl
  return true
}

function ServiceRow({ service, onEdit, onRemove }: { service: ServiceConfig; onEdit: () => void; onRemove: () => void }) {
  const configured = isServiceConfigured(service)
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn('h-2 w-2 rounded-full flex-shrink-0', configured ? 'bg-green-500' : 'bg-amber-400')} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{service.name}</span>
            {service.builtin && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Built-in</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[service.provider] ?? service.provider}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {!service.builtin && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Service Editor ──

function ServiceEditor({
  service,
  category,
  onSave,
  onCancel,
}: {
  service: ServiceConfig | null
  category: 'tts' | 'transcription'
  onSave: (service: ServiceConfig) => void
  onCancel: () => void
}) {
  const isNew = !service
  const addOptions = category === 'tts' ? TTS_ADD_OPTIONS : TRANSCRIPTION_ADD_OPTIONS
  const [provider, setProvider] = useState<ServiceProvider>(service?.provider ?? addOptions[0].provider)
  const [engine, setEngine] = useState<TtsEngine | TranscriptionEngine>(service?.engine ?? addOptions[0].engine)
  const [name, setName] = useState(service?.name ?? '')
  const [credentials, setCredentials] = useState<Record<string, string>>(service?.credentials ?? {})
  const [options, setOptions] = useState<Record<string, string>>(service?.options ?? {})

  // Verify state
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Models & voices (fetched from provider)
  const [modelOptions, setModelOptions] = useState<SelectOption[]>([])
  const [voiceOptions, setVoiceOptions] = useState<SelectOption[]>([])
  const [defaultModel, setDefaultModel] = useState('')

  function fetchModelsAndVoices() {
    if (category !== 'tts') return
    Promise.all([
      window.electronAPI.tts.listModels(engine as TtsEngine, credentials),
      window.electronAPI.tts.listVoices(engine as TtsEngine, credentials),
    ]).then(([modelsResult, voicesResult]) => {
      setModelOptions(modelsResult.options)
      setDefaultModel(modelsResult.default)
      setVoiceOptions(voicesResult.options)
      setPreviewVoice((prev) => prev || voicesResult.default)
    })
  }

  // Load models/voices on mount for existing services
  useEffect(() => {
    if (category !== 'tts' || !service) return
    fetchModelsAndVoices()
  }, [service?.id])

  async function handleVerify() {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await window.electronAPI.config.verifyService({
        id: service?.id ?? '',
        name: '',
        category,
        provider,
        engine,
        credentials,
        options,
      })
      setVerifyResult(result)
      if (result.ok) {
        fetchModelsAndVoices()
      }
    } catch (err) {
      setVerifyResult({ ok: false, error: (err as Error).message })
    } finally {
      setVerifying(false)
    }
  }

  // Preview state (TTS only)
  const [previewVoice, setPreviewVoice] = useState('')
  const [previewSpeed, setPreviewSpeed] = useState(1.0)
  const [previewing, setPreviewing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewAudioPath, setPreviewAudioPath] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const disposeAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [])

  function updateCredential(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }))
  }
  function updateOption(key: string, value: string) {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  function handleProviderChange(newProvider: string) {
    const opt = addOptions.find((o) => o.provider === newProvider) ?? addOptions[0]
    setProvider(opt.provider)
    setEngine(opt.engine)
    if (!name || name === defaultServiceName(engine)) {
      setName(defaultServiceName(opt.engine))
    }
    setCredentials({})
    setOptions({})
  }

  function handleSave() {
    onSave({
      id: service?.id ?? generateId(),
      name: name || defaultServiceName(engine),
      category,
      provider,
      engine,
      credentials,
      options,
      ...(service?.builtin ? { builtin: true } : {}),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{isNew ? 'Add' : 'Edit'} {category === 'tts' ? 'TTS' : 'Transcription'} Service</h3>
      </div>

      <div className="space-y-2">
        <Label>Provider</Label>
        {service ? (
          <Input value={PROVIDER_LABELS[provider] ?? provider} disabled />
        ) : (
          <Select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            options={addOptions.map((opt) => ({ value: opt.provider, label: opt.label }))}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          placeholder={defaultServiceName(engine)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!!service?.builtin}
        />
      </div>

      {/* Provider-specific fields */}
      {engine === 'elevenlabs' && (
        <>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk_..."
                value={credentials.apiKey ?? ''}
                onChange={(e) => updateCredential('apiKey', e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying || !credentials.apiKey}>
                {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Verify
              </Button>
              {verifyResult?.ok === true && <CheckCircle className="h-4 w-4 text-green-500 self-center" />}
              {verifyResult?.ok === false && <XCircle className="h-4 w-4 text-red-500 self-center" />}
            </div>
            {verifyResult?.ok === false && (
              <p className="text-xs text-red-500">{verifyResult.error}</p>
            )}
          </div>
          {modelOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Default Model</Label>
              <Select
                value={options.model ?? defaultModel}
                onChange={(e) => updateOption('model', e.target.value)}
                options={modelOptions}
              />
            </div>
          )}
        </>
      )}

      {engine === 'openai' && (
        <>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={credentials.apiKey ?? ''}
                onChange={(e) => updateCredential('apiKey', e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying || !credentials.apiKey}>
                {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Verify
              </Button>
              {verifyResult?.ok === true && <CheckCircle className="h-4 w-4 text-green-500 self-center" />}
              {verifyResult?.ok === false && <XCircle className="h-4 w-4 text-red-500 self-center" />}
            </div>
            {verifyResult?.ok === false && (
              <p className="text-xs text-red-500">{verifyResult.error}</p>
            )}
          </div>
          {modelOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Default Model</Label>
              <Select
                value={options.model ?? defaultModel}
                onChange={(e) => updateOption('model', e.target.value)}
                options={modelOptions}
              />
            </div>
          )}
        </>
      )}

      {engine === 'openai_compatible' && (
        <>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input
              placeholder="https://api.example.com/v1"
              value={options.baseUrl ?? ''}
              onChange={(e) => updateOption('baseUrl', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Input
              placeholder="tts-1"
              value={options.model ?? ''}
              onChange={(e) => updateOption('model', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>API Key (optional)</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={credentials.apiKey ?? ''}
                onChange={(e) => updateCredential('apiKey', e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying}>
                {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Verify
              </Button>
              {verifyResult?.ok === true && <CheckCircle className="h-4 w-4 text-green-500 self-center" />}
              {verifyResult?.ok === false && <XCircle className="h-4 w-4 text-red-500 self-center" />}
            </div>
            {verifyResult?.ok === false && (
              <p className="text-xs text-red-500">{verifyResult.error}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Voices (comma-separated: value:label,...)</Label>
            <Input
              placeholder="alloy:Alloy,nova:Nova"
              value={options.voices ?? ''}
              onChange={(e) => updateOption('voices', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Format: value:label pairs separated by commas. Example: alloy:Alloy,nova:Nova
            </p>
          </div>
        </>
      )}

      {engine === 'whisperx' && provider === 'local' && (
        <>
          <div className="space-y-2">
            <Label>WhisperX Path</Label>
            <div className="flex gap-2">
              <Input
                placeholder="/usr/local/bin/whisperx"
                value={options.whisperxPath ?? ''}
                onChange={(e) => updateOption('whisperxPath', e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={async () => {
                const result = await window.electronAPI.dialog.openFile()
                if (result) updateOption('whisperxPath', result)
              }}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Device</Label>
              <Select
                value={options.device ?? 'cpu'}
                onChange={(e) => updateOption('device', e.target.value)}
                options={[
                  { value: 'cpu', label: 'CPU' },
                  { value: 'cuda', label: 'CUDA (NVIDIA GPU)' },
                  { value: 'mps', label: 'MPS (Apple Silicon)' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label>Compute Type</Label>
              <Select
                value={options.computeType ?? 'float16'}
                onChange={(e) => updateOption('computeType', e.target.value)}
                options={[
                  { value: 'float16', label: 'float16' },
                  { value: 'int8', label: 'int8' },
                  { value: 'float32', label: 'float32' },
                ]}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Language</Label>
            <Input
              placeholder="en"
              value={options.defaultLanguage ?? ''}
              onChange={(e) => updateOption('defaultLanguage', e.target.value)}
              className="w-32"
            />
          </div>
        </>
      )}

      {provider === 'replicate' && (
        <div className="space-y-2">
          <Label>API Token</Label>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="r8_..."
              value={credentials.apiToken ?? ''}
              onChange={(e) => updateCredential('apiToken', e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying || !credentials.apiToken}>
              {verifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Verify
            </Button>
            {verifyResult?.ok === true && <CheckCircle className="h-4 w-4 text-green-500 self-center" />}
            {verifyResult?.ok === false && <XCircle className="h-4 w-4 text-red-500 self-center" />}
          </div>
          {verifyResult?.ok === false && (
            <p className="text-xs text-red-500">{verifyResult.error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Get your token at replicate.com/account/api-tokens
          </p>
        </div>
      )}

      {/* Default Voice (TTS services only) */}
      {category === 'tts' && voiceOptions.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="space-y-1 flex-1">
                <Label>Default Voice</Label>
                <Select
                  value={previewVoice}
                  onChange={(e) => { setPreviewVoice(e.target.value); disposeAudio(); setPreviewAudioPath(null) }}
                  options={voiceOptions}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Speed</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={previewSpeed}
                  onChange={(e) => setPreviewSpeed(parseFloat(e.target.value) || 1.0)}
                  className="w-20"
                />
              </div>
            </div>
            {service && (
              <>
                <p className="text-xs text-muted-foreground">
                  &ldquo;The quick brown fox jumps over the lazy dog. This is a preview of the selected voice.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      disposeAudio()
                      setPreviewing(true)
                      setPreviewAudioPath(null)
                      try {
                        const audioPath = await window.electronAPI.bookImport.preview(
                          service.id,
                          previewVoice,
                          previewSpeed,
                          options.model || undefined,
                        )
                        setPreviewAudioPath(audioPath)
                        const audio = new Audio(`local-media://localhost${encodeURI(audioPath)}`)
                        audio.onended = () => setIsPlaying(false)
                        audio.play()
                        audioRef.current = audio
                        setIsPlaying(true)
                      } catch (err) {
                        console.error('TTS preview failed:', err)
                      } finally {
                        setPreviewing(false)
                      }
                    }}
                    disabled={previewing || !previewVoice}
                  >
                    {previewing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Volume2 className="mr-1 h-3 w-3" />}
                    Try Voice
                  </Button>
                  {isPlaying && (
                    <Button variant="ghost" size="sm" onClick={disposeAudio}>
                      <Square className="mr-1 h-3 w-3" /> Stop
                    </Button>
                  )}
                  {previewAudioPath && !isPlaying && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        disposeAudio()
                        const audio = new Audio(`local-media://localhost${encodeURI(previewAudioPath)}`)
                        audio.onended = () => setIsPlaying(false)
                        audio.play()
                        audioRef.current = audio
                        setIsPlaying(true)
                      }}
                    >
                      <Play className="mr-1 h-3 w-3" /> Replay
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => { disposeAudio(); onCancel() }}>Cancel</Button>
        <Button size="sm" onClick={() => { disposeAudio(); handleSave() }}>
          {isNew ? 'Add Service' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
