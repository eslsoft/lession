import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

interface NewEpisodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedFile: string | null
  defaultTitle: string
  onCreate: (title: string, filePath: string) => Promise<void>
}

export function NewEpisodeDialog({ open, onOpenChange, selectedFile, defaultTitle, onCreate }: NewEpisodeDialogProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [creating, setCreating] = useState(false)

  // Sync default title when dialog opens
  React.useEffect(() => {
    if (open) setTitle(defaultTitle)
  }, [open, defaultTitle])

  const handleCreate = async () => {
    if (!selectedFile || !title.trim()) return
    setCreating(true)
    try {
      await onCreate(title.trim(), selectedFile)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>New Episode</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ep-title">Episode Title</Label>
            <Input
              id="ep-title"
              placeholder="Episode title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              File: {selectedFile.split('/').pop()}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !title.trim()}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
