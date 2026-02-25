import React, { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { TagInput, type Tag } from '../../components/TagInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { CoverImage } from '../../components/CoverImage'
import { typeOptions, levelOptions, categoryOptions, languageOptions } from './constants'
import type { Series, SeriesLevel } from '../../../shared/types'

interface EditSeriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  series: Series
  onSave: (data: Partial<Series>) => Promise<void>
  onUploadCover: () => void
}

export function EditSeriesDialog({ open, onOpenChange, series, onSave, onUploadCover }: EditSeriesDialogProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'course' as Series['type'],
    language: 'en',
    authors: [] as Tag[],
    category: '',
    tags: [] as Tag[],
    level: '' as SeriesLevel | '',
  })

  useEffect(() => {
    if (open) {
      setForm({
        title: series.title,
        description: series.description ?? '',
        type: series.type,
        language: series.language,
        authors: (series.authors ?? []).map((a) => ({ id: a, text: a })),
        category: series.category ?? '',
        tags: (series.tags ?? []).map((t) => ({ id: t, text: t })),
        level: series.level ?? '',
      })
    }
  }, [open, series])

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const authors = form.authors.map((t) => t.text).filter(Boolean)
      const tags = form.tags.map((t) => t.text).filter(Boolean)
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        language: form.language,
        authors: authors.length ? authors : undefined,
        category: form.category.trim() || undefined,
        tags: tags.length ? tags : undefined,
        level: form.level || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Edit Series</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cover Image</Label>
            <div
              className="flex items-center justify-center w-full h-32 rounded-lg border border-dashed border-input bg-muted/50 cursor-pointer hover:bg-muted transition-colors overflow-hidden"
              onClick={onUploadCover}
            >
              {series.coverPath ? (
                <CoverImage filePath={series.coverPath} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-8 w-8" />
                  <span className="text-xs">Click to upload cover</span>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              <Select
                id="edit-type"
                options={typeOptions}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Series['type'] }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-language">Language</Label>
              <Select
                id="edit-language"
                options={languageOptions}
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-level">Level</Label>
              <Select
                id="edit-level"
                options={levelOptions}
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as SeriesLevel | '' }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                id="edit-category"
                options={categoryOptions}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Authors</Label>
            <TagInput
              placeholder="Type and press Enter"
              tags={form.authors}
              setTags={(newTags) => setForm((f) => ({ ...f, authors: newTags }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput
              placeholder="Type and press Enter"
              tags={form.tags}
              setTags={(newTags) => setForm((f) => ({ ...f, tags: newTags }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
