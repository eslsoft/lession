import type { Download } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@renderer/components/ui/dialog'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  download: Download | null
  seriesOptions: { value: string; label: string }[]
  seriesId: string
  onSeriesChange: (id: string) => void
  onImport: () => void
}

export default function ImportDialog({
  open,
  onOpenChange,
  download,
  seriesOptions,
  seriesId,
  onSeriesChange,
  onImport,
}: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Import as Episode</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Import "{download?.title || download?.filename}" — you can choose to create a single episode or split into multiple on the next page.
          </p>
          <div>
            <label className="text-sm font-medium mb-1 block">Target Series</label>
            {seriesOptions.length > 0 ? (
              <Select
                options={seriesOptions}
                value={seriesId}
                onChange={(e) => onSeriesChange(e.target.value)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No series available. Create a series first.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onImport} disabled={!seriesId}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
