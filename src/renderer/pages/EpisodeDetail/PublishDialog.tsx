import React, { useState, useEffect } from 'react'
import { Loader2, Upload, FileText, FileVideo, FileJson, File } from 'lucide-react'
import { JsonView, allExpanded, defaultStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import type { PublishStatus, Episode, PublishPreviewFile } from '../../../shared/types'
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

function FileIcon({ name }: { name: string }) {
  if (name.endsWith('.json')) return <FileJson className="h-3.5 w-3.5 shrink-0" />
  if (name.endsWith('.srt') || name.endsWith('.vtt')) return <FileText className="h-3.5 w-3.5 shrink-0" />
  if (/\.(mp4|mp3|m4a|webm|mkv|wav|ogg|flac)$/.test(name)) return <FileVideo className="h-3.5 w-3.5 shrink-0" />
  return <File className="h-3.5 w-3.5 shrink-0" />
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
  // text (srt / vtt)
  return <pre className="whitespace-pre-wrap font-mono text-xs">{file.content as string}</pre>
}

export default function PublishDialog({
  open, onClose, episode, s3Ready, publishing, onPublish, onUnpublish,
}: Props) {
  const [mode, setMode] = useState<'published' | 'preview'>(
    episode.publishStatus === 'preview' ? 'preview' : 'published',
  )
  const [files, setFiles] = useState<PublishPreviewFile[] | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setFiles(null)
    setActiveIdx(0)
    window.electronAPI.publisher.previewPublish(episode.id, mode).then(setFiles)
  }, [open, episode.id, mode])

  const isAlreadyPublished = episode.publishStatus !== 'draft'

  // Extract just the filename from the full S3 key for tab display
  const tabLabel = (key: string) => key.split('/').pop() ?? key

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl w-full" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Publish Episode</DialogTitle>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-3 mb-2">
          {(['published', 'preview'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                mode === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                  mode === m ? 'border-primary bg-primary' : 'border-muted-foreground',
                )}
              >
                {mode === m && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <div className="font-medium text-sm">
                  {m === 'published' ? 'Published' : 'Preview'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {m === 'published'
                    ? 'Publicly visible in the feed'
                    : 'Draft/preview — included in feed but marked as preview'}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* File preview */}
        <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
          Files to upload ({files?.length ?? '…'})
        </div>

        {!files ? (
          <div className="rounded-md border bg-white p-6 text-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <div className="rounded-md border bg-white overflow-hidden">
            {/* File tabs */}
            <div className="flex gap-0 border-b overflow-x-auto bg-muted/30">
              {files.map((file, idx) => (
                <button
                  key={file.key}
                  onClick={() => setActiveIdx(idx)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors',
                    activeIdx === idx
                      ? 'border-primary text-foreground bg-white'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                  title={file.key}
                >
                  <FileIcon name={file.key} />
                  {tabLabel(file.key)}
                </button>
              ))}
            </div>

            {/* S3 key path */}
            <div className="px-3 py-1.5 border-b bg-muted/20 text-xs text-muted-foreground font-mono">
              {files[activeIdx].key}
            </div>

            {/* File content */}
            <div className="overflow-auto max-h-64 p-3 text-xs">
              <FileContent file={files[activeIdx]} />
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
