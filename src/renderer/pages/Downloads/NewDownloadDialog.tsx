import React, { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import {
  Download as DownloadIcon,
  Link,
  List,
  Loader2,
} from 'lucide-react'

interface NewDownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (urls: string[]) => Promise<void>
}

export default function NewDownloadDialog({ open, onOpenChange, onSubmit }: NewDownloadDialogProps) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [batchMode, setBatchMode] = useState(false)

  const close = () => {
    onOpenChange(false)
    setUrl('')
    setBatchMode(false)
  }

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const urls = batchMode
        ? trimmed.split('\n').map(u => u.trim()).filter(Boolean)
        : [trimmed]
      if (urls.length > 0) {
        await onSubmit(urls)
      }
      close()
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !batchMode) {
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v) }}>
      <DialogContent onClose={close}>
        <DialogHeader>
          <DialogTitle>New Download</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant={batchMode ? 'outline' : 'secondary'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => { setBatchMode(false); setUrl('') }}
            >
              <Link className="h-3 w-3" />
              Single
            </Button>
            <Button
              variant={batchMode ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => { setBatchMode(true); setUrl('') }}
            >
              <List className="h-3 w-3" />
              Batch
            </Button>
          </div>

          {batchMode ? (
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Paste one URL per line..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={submitting}
              autoFocus
            />
          ) : (
            <Input
              placeholder="Paste video or audio URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={submitting}
              autoFocus
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !url.trim()}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <DownloadIcon className="h-4 w-4 mr-1.5" />
            )}
            {batchMode ? 'Download All' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
