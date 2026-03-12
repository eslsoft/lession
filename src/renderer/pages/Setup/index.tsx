import React, { useState, useEffect, useRef } from 'react'
import { FolderOpen, CheckCircle, XCircle, Loader2, HardDrive, Mic, Download, X, Volume2, Play, Square, Terminal } from 'lucide-react'
import { useConfigStore } from '../../stores/configStore'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { cn } from '../../lib/utils'
import type { AppConfig } from '../../../shared/types'
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
  transcription: {
    provider: 'local_whisperx',
    whisperxPath: '',
    device: 'cpu',
    computeType: 'float16',
    defaultLanguage: 'en',
    replicate: {
      apiToken: '',
    },
  },
  import: {
    ytdlpPath: '',
    downloadDir: '',
  },
  tts: {
    provider: 'edge_tts',
    voice: 'en-US-AndrewMultilingualNeural',
    speed: 1.0,
  },
}

type Section = 'storage' | 'transcription' | 'tts' | 'import' | 'environment'

const sections = [
  { id: 'storage' as Section, label: 'Storage', icon: HardDrive },
  { id: 'transcription' as Section, label: 'Transcription', icon: Mic },
  { id: 'tts' as Section, label: 'TTS', icon: Volume2 },
  { id: 'import' as Section, label: 'Import', icon: Download },
  { id: 'environment' as Section, label: 'Environment', icon: Terminal },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function SetupDialog({ open, onOpenChange }: Props) {
  const { config, saveConfig, testS3Connection } = useConfigStore()
  const isFirstTime = !config

  const [activeSection, setActiveSection] = useState<Section>('storage')
  const [form, setForm] = useState<AppConfig>(config ?? defaultConfig)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewAudioPath, setPreviewAudioPath] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function disposeAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
    setIsPlaying(false)
  }

  useEffect(() => {
    if (config) setForm({ ...defaultConfig, ...config, tts: { ...defaultConfig.tts, ...config.tts } })
  }, [config])

  function updateStorage<K extends keyof AppConfig['storage']>(key: K, value: AppConfig['storage'][K]) {
    setForm((prev) => ({ ...prev, storage: { ...prev.storage, [key]: value } }))
    setTestResult(null)
  }

  function updateTranscription<K extends keyof AppConfig['transcription']>(key: K, value: AppConfig['transcription'][K]) {
    setForm((prev) => ({ ...prev, transcription: { ...prev.transcription, [key]: value } }))
  }

  function updateImport<K extends keyof AppConfig['import']>(key: K, value: AppConfig['import'][K]) {
    setForm((prev) => ({ ...prev, import: { ...prev.import, [key]: value } }))
  }

  function updateTts<K extends keyof AppConfig['tts']>(key: K, value: AppConfig['tts'][K]) {
    setForm((prev) => ({ ...prev, tts: { ...prev.tts, [key]: value } }))
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

  async function handleSelectFile() {
    const result = await window.electronAPI.dialog.openFile()
    if (result) {
      updateTranscription('whisperxPath', result)
    }
  }

  async function handleSelectDirectory() {
    const result = await window.electronAPI.dialog.openDirectory()
    if (result) updateImport('downloadDir', result)
  }

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

              {activeSection === 'transcription' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider">Provider</Label>
                    <Select
                      id="provider"
                      value={form.transcription.provider}
                      onChange={(e) => updateTranscription('provider', e.target.value as 'local_whisperx' | 'replicate')}
                      options={[
                        { value: 'local_whisperx', label: 'Local WhisperX' },
                        { value: 'replicate', label: 'Replicate WhisperX' },
                      ]}
                    />
                  </div>

                  <Separator />

                  {form.transcription.provider === 'local_whisperx' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="whisperxPath">WhisperX Path</Label>
                        <div className="flex gap-2">
                          <Input
                            id="whisperxPath"
                            placeholder="/usr/local/bin/whisperx"
                            value={form.transcription.whisperxPath}
                            onChange={(e) => updateTranscription('whisperxPath', e.target.value)}
                            className="flex-1"
                          />
                          <Button variant="outline" size="icon" onClick={handleSelectFile}>
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="device">Device</Label>
                          <Select
                            id="device"
                            value={form.transcription.device}
                            onChange={(e) => updateTranscription('device', e.target.value as 'cpu' | 'cuda' | 'mps')}
                            options={[
                              { value: 'cpu', label: 'CPU' },
                              { value: 'cuda', label: 'CUDA (NVIDIA GPU)' },
                              { value: 'mps', label: 'MPS (Apple Silicon)' },
                            ]}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="computeType">Compute Type</Label>
                          <Select
                            id="computeType"
                            value={form.transcription.computeType}
                            onChange={(e) => updateTranscription('computeType', e.target.value)}
                            options={[
                              { value: 'float16', label: 'float16' },
                              { value: 'int8', label: 'int8' },
                              { value: 'float32', label: 'float32' },
                            ]}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {form.transcription.provider === 'replicate' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="replicateApiToken">API Token</Label>
                        <Input
                          id="replicateApiToken"
                          type="password"
                          placeholder="r8_..."
                          value={form.transcription.replicate?.apiToken ?? ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              transcription: {
                                ...prev.transcription,
                                replicate: { ...prev.transcription.replicate, apiToken: e.target.value },
                              },
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Get your token at replicate.com/account/api-tokens
                        </p>
                      </div>

                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="defaultLanguage">Default Language</Label>
                    <Input
                      id="defaultLanguage"
                      placeholder="en"
                      value={form.transcription.defaultLanguage}
                      onChange={(e) => updateTranscription('defaultLanguage', e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>
              )}

              {activeSection === 'tts' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ttsProvider">Provider</Label>
                    <Select
                      id="ttsProvider"
                      value={form.tts?.provider ?? 'edge_tts'}
                      onChange={(e) => {
                        const provider = e.target.value as AppConfig['tts']['provider']
                        updateTts('provider', provider)
                        // Reset voice to default for the selected provider
                        if (provider === 'edge_tts') updateTts('voice', 'en-US-AndrewMultilingualNeural')
                        else if (provider === 'kokoro') updateTts('voice', 'af_heart')
                        setPreviewAudioPath(null)
                      }}
                      options={[
                        { value: 'edge_tts', label: 'Edge TTS (Recommended)' },
                        { value: 'kokoro', label: 'Kokoro-82M' },
                      ]}
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ttsVoice">Voice</Label>
                      {form.tts?.provider === 'edge_tts' ? (
                        <Select
                          id="ttsVoice"
                          value={form.tts?.voice ?? 'en-US-AndrewMultilingualNeural'}
                          onChange={(e) => { updateTts('voice', e.target.value); setPreviewAudioPath(null) }}
                          options={[
                            { value: 'en-US-AndrewMultilingualNeural', label: 'Andrew (Male)' },
                            { value: 'en-US-AvaMultilingualNeural', label: 'Ava (Female)' },
                            { value: 'en-US-GuyNeural', label: 'Guy (Male)' },
                            { value: 'en-US-JennyNeural', label: 'Jenny (Female)' },
                            { value: 'en-US-AriaNeural', label: 'Aria (Female)' },
                            { value: 'en-GB-SoniaNeural', label: 'Sonia (British Female)' },
                            { value: 'en-GB-RyanNeural', label: 'Ryan (British Male)' },
                          ]}
                        />
                      ) : (
                        <Select
                          id="ttsVoice"
                          value={form.tts?.voice ?? 'af_heart'}
                          onChange={(e) => { updateTts('voice', e.target.value); setPreviewAudioPath(null) }}
                          options={[
                            { value: 'af_heart', label: 'Heart (Female)' },
                            { value: 'af_bella', label: 'Bella (Female)' },
                            { value: 'af_sarah', label: 'Sarah (Female)' },
                            { value: 'am_adam', label: 'Adam (Male)' },
                            { value: 'am_michael', label: 'Michael (Male)' },
                            { value: 'bf_emma', label: 'Emma (British Female)' },
                            { value: 'bm_george', label: 'George (British Male)' },
                          ]}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ttsSpeed">Speed</Label>
                      <Input
                        id="ttsSpeed"
                        type="number"
                        min={0.5}
                        max={2.0}
                        step={0.1}
                        value={form.tts?.speed ?? 1.0}
                        onChange={(e) => updateTts('speed', parseFloat(e.target.value) || 1.0)}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Voice Preview */}
                  <div className="space-y-3">
                    <Label>Voice Preview</Label>
                    <p className="text-xs text-muted-foreground">
                      "The quick brown fox jumps over the lazy dog. This is a preview of the selected voice."
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
                              form.tts.provider,
                              form.tts.voice,
                              form.tts.speed,
                            )
                            setPreviewAudioPath(audioPath)
                            // Auto-play after generation
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
                        disabled={previewing}
                      >
                        {previewing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Try Voice
                      </Button>
                      {isPlaying && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => disposeAudio()}
                        >
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
                  </div>
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

            {/* Footer */}
            <div className="flex flex-shrink-0 justify-end border-t border-border px-6 py-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isFirstTime ? 'Save & Get Started' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
