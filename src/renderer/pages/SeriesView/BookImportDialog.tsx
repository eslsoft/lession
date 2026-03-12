import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { ExtractedBook } from '../../../shared/types'

interface BookImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  extractedBook: ExtractedBook | null
  onConfirm: (chapters: { title: string; text: string }[]) => Promise<void>
}

export function BookImportDialog({ open, onOpenChange, extractedBook, onConfirm }: BookImportDialogProps) {
  const [chapters, setChapters] = useState<{ title: string; text: string; selected: boolean }[]>([])
  const [generating, setGenerating] = useState(false)

  // Sync chapters when extractedBook changes
  React.useEffect(() => {
    if (extractedBook) {
      setChapters(extractedBook.chapters.map((ch) => ({
        title: ch.title,
        text: ch.text,
        selected: true,
      })))
    }
  }, [extractedBook])

  const selectedCount = chapters.filter((ch) => ch.selected).length

  const toggleChapter = (index: number) => {
    setChapters((prev) => prev.map((ch, i) => i === index ? { ...ch, selected: !ch.selected } : ch))
  }

  const toggleAll = () => {
    const allSelected = chapters.every((ch) => ch.selected)
    setChapters((prev) => prev.map((ch) => ({ ...ch, selected: !allSelected })))
  }

  const updateTitle = (index: number, title: string) => {
    setChapters((prev) => prev.map((ch, i) => i === index ? { ...ch, title } : ch))
  }

  const handleConfirm = async () => {
    const selected = chapters.filter((ch) => ch.selected).map(({ title, text }) => ({ title, text }))
    if (selected.length === 0) return
    setGenerating(true)
    try {
      await onConfirm(selected)
      onOpenChange(false)
    } finally {
      setGenerating(false)
    }
  }

  if (!extractedBook) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generating) onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" onClose={() => { if (!generating) onOpenChange(false) }}>
        <DialogHeader>
          <DialogTitle>Import Book: {extractedBook.title}</DialogTitle>
          {extractedBook.author !== 'Unknown' && (
            <p className="text-sm text-muted-foreground">by {extractedBook.author}</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-lg divide-y">
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 text-sm font-medium sticky top-0">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              checked={chapters.length > 0 && chapters.every((ch) => ch.selected)}
              ref={(el) => {
                if (el) el.indeterminate = selectedCount > 0 && selectedCount < chapters.length
              }}
              onChange={toggleAll}
            />
            <span className="flex-1">Chapter ({selectedCount}/{chapters.length} selected)</span>
            <span className="w-20 text-right">Length</span>
          </div>

          {/* Chapter rows */}
          {chapters.map((ch, i) => (
            <div key={`${i}-${ch.title}`} className={`flex items-center gap-3 px-3 py-2 ${ch.selected ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer flex-shrink-0"
                checked={ch.selected}
                onChange={() => toggleChapter(i)}
              />
              <Input
                value={ch.title}
                onChange={(e) => updateTitle(i, e.target.value)}
                className="flex-1 h-8 text-sm"
                disabled={!ch.selected}
              />
              <span className="w-20 text-right text-xs text-muted-foreground flex-shrink-0">
                {ch.text.length > 1000 ? `${(ch.text.length / 1000).toFixed(1)}k` : ch.text.length} chars
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={generating || selectedCount === 0}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              `Generate ${selectedCount} Episode${selectedCount > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
