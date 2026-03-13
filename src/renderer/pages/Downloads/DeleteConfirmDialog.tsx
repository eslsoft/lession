import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: (deleteFiles: boolean) => void
}

export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '删除',
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false)

  const handleConfirm = () => {
    onConfirm(deleteFiles)
    setDeleteFiles(false)
  }

  const handleClose = () => {
    onOpenChange(false)
    setDeleteFiles(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent onClose={handleClose}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-destructive"
          />
          <span className="text-sm">同时删除本地文件</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
