import React from 'react'
import { FileMusic, Scissors, BookOpen, Type } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'

export type CreationMethod = 'file' | 'split' | 'book' | 'text'

interface CreateEpisodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (method: CreationMethod) => void
}

const methods: { method: CreationMethod; icon: React.ElementType; title: string; description: string; accent: string }[] = [
  {
    method: 'file',
    icon: FileMusic,
    title: 'From File',
    description: 'Import a single audio or video file as one episode',
    accent: 'text-blue-500',
  },
  {
    method: 'split',
    icon: Scissors,
    title: 'Split Long Audio',
    description: 'Split one long audio file into multiple episodes with waveform editor',
    accent: 'text-blue-500',
  },
  {
    method: 'book',
    icon: BookOpen,
    title: 'From Book',
    description: 'Import EPUB or PDF, extract chapters and generate audio with TTS',
    accent: 'text-purple-500',
  },
  {
    method: 'text',
    icon: Type,
    title: 'From Text',
    description: 'Paste or type text content and generate audio with TTS',
    accent: 'text-purple-500',
  },
]

export function CreateEpisodeDialog({ open, onOpenChange, onSelect }: CreateEpisodeDialogProps) {
  const handleSelect = (method: CreationMethod) => {
    onOpenChange(false)
    onSelect(method)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Create New Episode</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose how you want to create your episode</p>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Import Audio</p>
          <div className="grid grid-cols-2 gap-3">
            {methods.slice(0, 2).map((m) => (
              <MethodCard key={m.method} {...m} onSelect={handleSelect} />
            ))}
          </div>

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Generate from Text</p>
          <div className="grid grid-cols-2 gap-3">
            {methods.slice(2).map((m) => (
              <MethodCard key={m.method} {...m} onSelect={handleSelect} />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MethodCard({
  method,
  icon: Icon,
  title,
  description,
  accent,
  onSelect,
}: {
  method: CreationMethod
  icon: React.ElementType
  title: string
  description: string
  accent: string
  onSelect: (method: CreationMethod) => void
}) {
  return (
    <button
      className="flex flex-col gap-2.5 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-accent-foreground/20 transition-colors text-left cursor-pointer"
      onClick={() => onSelect(method)}
    >
      <Icon className={`h-6 w-6 ${accent}`} />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  )
}
