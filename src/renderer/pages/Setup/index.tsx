import React, { useState, useEffect } from 'react'
import { FolderOpen, CheckCircle, XCircle, Loader2, HardDrive, Mic, Download, X } from 'lucide-react'
import { useConfigStore } from '../../stores/configStore'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { cn } from '../../lib/utils'
import type { AppConfig } from '../../../shared/types'

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
  },
  import: {
    ytdlpPath: '',
    downloadDir: '',
  },
}

type Section = 'storage' | 'transcription' | 'import'

const sections = [
  { id: 'storage' as Section, label: 'Storage', icon: HardDrive },
  { id: 'transcription' as Section, label: 'Transcription', icon: Mic },
  { id: 'import' as Section, label: 'Import', icon: Download },
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

  useEffect(() => {
    if (config) setForm(config)
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

  async function handleSelectFile(field: 'whisperxPath' | 'ytdlpPath') {
    const result = await window.electronAPI.dialog.openFile()
    if (result) {
      if (field === 'whisperxPath') updateTranscription('whisperxPath', result)
      else updateImport('ytdlpPath', result)
    }
  }

  async function handleSelectDirectory() {
    const result = await window.electronAPI.dialog.openDirectory()
    if (result) updateImport('downloadDir', result)
  }

  return (
    <Dialog open={open} onOpenChange={isFirstTime ? () => {} : onOpenChange}>
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
                    <Label htmlFor="whisperxPath">WhisperX Path</Label>
                    <div className="flex gap-2">
                      <Input
                        id="whisperxPath"
                        placeholder="/usr/local/bin/whisperx"
                        value={form.transcription.whisperxPath}
                        onChange={(e) => updateTranscription('whisperxPath', e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={() => handleSelectFile('whisperxPath')}>
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

              {activeSection === 'import' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ytdlpPath">yt-dlp Path</Label>
                    <div className="flex gap-2">
                      <Input
                        id="ytdlpPath"
                        placeholder="/usr/local/bin/yt-dlp"
                        value={form.import.ytdlpPath}
                        onChange={(e) => updateImport('ytdlpPath', e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={() => handleSelectFile('ytdlpPath')}>
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

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
