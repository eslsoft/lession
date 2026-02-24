import React, { useState, useEffect, useCallback } from 'react'
import { Loader2, Upload, FileText, FileVideo, FileJson, File } from 'lucide-react'
import { JsonView, allExpanded, defaultStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { Label } from '../../components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import type { PublishStatus, Episode, PublishFileInfo, PublishPreviewFile } from '../../../shared/types'
import { cn } from '../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  episode: Episode
  s3Ready: boolean
  publishing: boolean
  onPublish: (mode: PublishStatus) => void
  onUnpublish: () => void
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  const cls = cn('h-3.5 w-3.5 shrink-0', className)
  if (name.endsWith('.json')) return <FileJson className={cls} />
  if (name.endsWith('.srt') || name.endsWith('.vtt')) return <FileText className={cls} />
  if (/\.(mp4|mp3|m4a|webm|mkv|wav|ogg|flac)$/.test(name)) return <FileVideo className={cls} />
  return <File className={cls} />
}

function FileContent({ file }: { file: PublishPreviewFile }) {
  if (file.type === 'binary') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Binary file — {file.size ?? 'unknown size'}
      </div>
    )
  }
  if (file.type === 'json') {
    return (
      <JsonView
        data={file.content as object}
        shouldExpandNode={allExpanded}
        style={defaultStyles}
        clickToExpandNode
      />
    )
  }
  return <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{file.content as string}</pre>
}

export default function PublishDialog({
  open, onClose, episode, s3Ready, publishing, onPublish, onUnpublish,
}: Props) {
  const [mode, setMode] = useState<PublishStatus>(
    episode.publishStatus === 'preview' ? 'preview' : 'published',
  )
  const [files, setFiles] = useState<PublishFileInfo[] | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // content cache: key → loaded file (or 'loading')
  const [contentCache, setContentCache] = useState<Record<string, PublishPreviewFile | 'loading'>>({})

  const isAlreadyPublished = episode.publishStatus !== 'draft'
  const fileName = (key: string) => key.split('/').pop() ?? key

  const loadFile = useCallback((key: string, currentMode: PublishStatus) => {
    setActiveKey(key)
    setContentCache((prev) => {
      if (prev[key] && prev[key] !== 'loading') return prev
      return { ...prev, [key]: 'loading' }
    })
    window.electronAPI.publisher.previewFile(episode.id, key, currentMode).then((result) => {
      if (result) setContentCache((prev) => ({ ...prev, [key]: result }))
    })
  }, [episode.id])

  // Load file list on open; reset on close
  useEffect(() => {
    if (!open) {
      setFiles(null)
      setActiveKey(null)
      setContentCache({})
      return
    }
    window.electronAPI.publisher.previewFiles(episode.id, mode).then((result) => {
      if (!result) return
      setFiles(result)
      // Auto-load feed.json by default
      const feedKey = result.find((f) => f.key.endsWith('feed.json'))?.key ?? result[0]?.key
      if (feedKey) loadFile(feedKey, mode)
    })
  }, [open, episode.id])

  // On mode change: clear cache for json files (feed/index content changes), reload active if affected
  const handleModeChange = (newMode: PublishStatus) => {
    setMode(newMode)
    setContentCache((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.endsWith('.json')) delete next[key]
      }
      return next
    })
    if (activeKey?.endsWith('.json')) {
      loadFile(activeKey, newMode)
    }
  }

  const activeContent = activeKey ? contentCache[activeKey] : null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl w-full" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Publish Episode</DialogTitle>
        </DialogHeader>

        {/* Preview toggle */}
        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 mt-1">
          <div>
            <Label htmlFor="preview-switch" className="text-sm font-medium cursor-pointer">
              Publish as Preview
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === 'preview'
                ? 'Included in feed but marked as preview'
                : 'Publicly visible in the feed'}
            </p>
          </div>
          <Switch
            id="preview-switch"
            checked={mode === 'preview'}
            onCheckedChange={(v) => handleModeChange(v ? 'preview' : 'published')}
          />
        </div>

        {/* Two-panel file viewer */}
        {!files ? (
          <div className="rounded-lg bg-muted/30 h-64 flex items-center justify-center text-muted-foreground text-sm gap-2 mt-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="rounded-lg bg-muted/20 overflow-hidden flex mt-3" style={{ height: '280px' }}>
            {/* File list */}
            <div className="w-44 shrink-0 border-r border-border/50 overflow-y-auto bg-muted/40">
              {files.map((file) => (
                <button
                  key={file.key}
                  onClick={() => loadFile(file.key, mode)}
                  title={file.key}
                  className={cn(
                    'w-full flex flex-col items-start px-3 py-2.5 text-left transition-colors border-b border-border/50 last:border-0',
                    activeKey === file.key
                      ? 'bg-primary/8 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-1.5 w-full">
                    <FileIcon
                      name={file.key}
                      className={activeKey === file.key ? 'text-primary' : ''}
                    />
                    <span className="text-xs font-medium truncate">{fileName(file.key)}</span>
                  </span>
                  {file.size && (
                    <span className="text-[10px] text-muted-foreground mt-0.5 ml-5">{file.size}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content panel */}
            <div className="flex-1 overflow-hidden flex flex-col min-w-0 bg-white">
              {activeKey && (
                <div className="px-3 py-1.5 border-b border-border/40 bg-muted/10 text-[10px] text-muted-foreground font-mono truncate shrink-0">
                  {activeKey}
                </div>
              )}
              <div className="flex-1 overflow-auto p-3 text-xs">
                {!activeContent || activeContent === 'loading' ? (
                  <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <FileContent file={activeContent} />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {isAlreadyPublished && (
            <Button
              variant="outline"
              className="sm:mr-auto text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
              onClick={onUnpublish}
              disabled={publishing}
            >
              {publishing && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              Unpublish
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={publishing}>
            Cancel
          </Button>
          <Button
            onClick={() => onPublish(mode)}
            disabled={publishing || !s3Ready}
            title={!s3Ready ? 'S3 storage not configured — go to Settings' : undefined}
          >
            {publishing
              ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            {mode === 'published' ? 'Publish' : 'Publish as Preview'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
