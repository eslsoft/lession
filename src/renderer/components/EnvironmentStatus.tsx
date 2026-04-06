import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw, ExternalLink, Copy, Loader2, Download, ArrowUpCircle } from 'lucide-react'
import { Button } from './ui/button'
import type { ToolStatus, ToolActionProgress } from '../../shared/types'

export default function EnvironmentStatus() {
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedHint, setCopiedHint] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [actionOutput, setActionOutput] = useState('')

  async function checkTools() {
    setLoading(true)
    try {
      setTools(await window.electronAPI.env.checkAll())
    } catch (err) {
      console.error('Failed to check tools:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkTools()
    const unsubscribe = window.electronAPI.env.onToolProgress((data: ToolActionProgress) => {
      if (data.stage === 'done') {
        setActionInProgress(null)
        setActionOutput('')
        checkTools()
      } else if (data.stage === 'error') {
        setActionInProgress(null)
        setActionOutput(data.error || 'Unknown error')
      } else if (data.output) {
        setActionOutput((prev) => prev + data.output)
      }
    })
    return unsubscribe
  }, [])

  function copyToClipboard(text: string, name: string) {
    navigator.clipboard.writeText(text)
    setCopiedHint(name)
    setTimeout(() => setCopiedHint(null), 2000)
  }

  async function handleInstall(name: string) {
    setActionInProgress(name)
    setActionOutput('')
    try {
      await window.electronAPI.env.installTool(name)
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleUpgrade(name: string) {
    setActionInProgress(name)
    setActionOutput('')
    try {
      await window.electronAPI.env.upgradeTool(name)
    } finally {
      setActionInProgress(null)
    }
  }

  const bundled = tools.filter((t) => t.bundled)
  const managed = tools.filter((t) => t.managedBy === 'uv')
  const system = tools.filter((t) => !t.bundled && t.managedBy !== 'uv')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Check if all required tools are available.
        </p>
        <Button variant="outline" size="sm" onClick={checkTools} disabled={loading || !!actionInProgress}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Re-check
        </Button>
      </div>

      {/* Bundled tools */}
      <ToolSection title="Bundled" description="Included with the app.">
        {loading && bundled.length === 0 ? <LoadingRow /> : bundled.map((t) => (
          <ToolRow key={t.name} tool={t} />
        ))}
      </ToolSection>

      {/* uv-managed tools */}
      <ToolSection title="Managed by uv" description="Click Install to set up, or Upgrade to check for newer versions.">
        {loading && managed.length === 0 ? <LoadingRow /> : managed.map((tool) => (
          <div key={tool.name} className="space-y-1">
            <div className="flex items-center gap-2">
              <ToolRow tool={tool} />
              {actionInProgress !== tool.name && (
                <div className="flex gap-1 ml-auto">
                  {!tool.available && (
                    <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => handleInstall(tool.name)}>
                      <Download className="mr-1 h-3 w-3" /> Install
                    </Button>
                  )}
                  {tool.available && (
                    <button
                      className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleUpgrade(tool.name)}
                    >
                      <ArrowUpCircle className="mr-1 h-3 w-3" /> Upgrade
                    </button>
                  )}
                </div>
              )}
              {actionInProgress === tool.name && (
                <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Working...
                </div>
              )}
            </div>
            {actionInProgress === tool.name && actionOutput && (
              <pre className="ml-7 max-h-24 overflow-auto rounded bg-muted px-2 py-1 text-xs font-mono whitespace-pre-wrap">
                {actionOutput}
              </pre>
            )}
          </div>
        ))}
      </ToolSection>

      {/* System tools */}
      <ToolSection title="System" description="Must be installed manually on your system.">
        {loading && system.length === 0 ? <LoadingRow /> : system.map((tool) => (
          <div key={tool.name} className="space-y-1">
            <ToolRow tool={tool} />
            {!tool.available && tool.installHint && (
              <div className="ml-7 flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-0.5 text-xs">{tool.installHint}</code>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => copyToClipboard(tool.installHint!, tool.name)}
                  title="Copy command"
                >
                  {copiedHint === tool.name ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                {tool.installUrl && (
                  <a href={tool.installUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Open install page">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </ToolSection>

      {/* Feature mapping */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Tool Usage</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>yt-dlp</strong> — Required for downloading media from URLs</p>
          <p><strong>whisperx</strong> — Required only when using WhisperX with Local provider</p>
          <p><strong>ebook-convert</strong> — Required only for importing PDF books (converts PDF to EPUB)</p>
        </div>
      </div>
    </div>
  )
}

function ToolSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Checking...
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolStatus }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
      {tool.available ? (
        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
      )}
      <span className="text-sm font-mono">{tool.name}</span>
      {tool.available && tool.version && (
        <span className="text-xs text-muted-foreground truncate max-w-[280px]">{tool.version}</span>
      )}
      {!tool.available && (
        <span className="text-xs text-red-500">Not found</span>
      )}
    </div>
  )
}
