import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw, ExternalLink, Copy, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import type { ToolStatus } from '../../shared/types'

export default function EnvironmentStatus() {
  const [tools, setTools] = useState<ToolStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedHint, setCopiedHint] = useState<string | null>(null)

  async function checkTools() {
    setLoading(true)
    try {
      const result = await window.electronAPI.env.checkAll()
      setTools(result)
    } catch (err) {
      console.error('Failed to check tools:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkTools()
  }, [])

  function copyToClipboard(text: string, name: string) {
    navigator.clipboard.writeText(text)
    setCopiedHint(name)
    setTimeout(() => setCopiedHint(null), 2000)
  }

  const bundled = tools.filter((t) => t.bundled)
  const external = tools.filter((t) => !t.bundled)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Check if all required tools are available.
        </p>
        <Button variant="outline" size="sm" onClick={checkTools} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Re-check
        </Button>
      </div>

      {/* Bundled tools */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Bundled Tools</h3>
        <p className="text-xs text-muted-foreground">These tools are included with the app.</p>
        <div className="space-y-1">
          {loading && bundled.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking...
            </div>
          ) : (
            bundled.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))
          )}
        </div>
      </div>

      {/* External tools */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">External Tools</h3>
        <p className="text-xs text-muted-foreground">These tools need to be installed separately. Not all are required — only install what you need.</p>
        <div className="space-y-1">
          {loading && external.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking...
            </div>
          ) : (
            external.map((tool) => (
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
                      <a
                        href={tool.installUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title="Open install page"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Feature mapping */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Tool Usage</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>uv</strong> — Required for NLP analysis, TTS (Edge TTS / Kokoro), and book import (EPUB extraction)</p>
          <p><strong>whisperx</strong> — Required only when using WhisperX with Local provider</p>
          <p><strong>ebook-convert</strong> — Required only for importing PDF books (converts PDF to EPUB)</p>
        </div>
      </div>
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
