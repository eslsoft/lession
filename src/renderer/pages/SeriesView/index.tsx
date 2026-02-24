import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Library } from 'lucide-react'
import { TagInput, type Tag } from '../../components/TagInput'
import { useSeriesStore } from '../../stores/seriesStore'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { CoverImage } from '../../components/CoverImage'
import type { Series, SeriesLevel } from '../../../shared/types'

const typeOptions = [
  { value: 'course', label: 'Course' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'video_series', label: 'Video Series' },
]

const levelOptions = [
  { value: '', label: 'None' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const categoryOptions = [
  { value: '', label: 'None' },
  { value: 'technology', label: 'Technology' },
  { value: 'business', label: 'Business' },
  { value: 'science', label: 'Science' },
  { value: 'health', label: 'Health & Fitness' },
  { value: 'education', label: 'Education' },
  { value: 'news', label: 'News & Politics' },
  { value: 'arts', label: 'Arts & Culture' },
  { value: 'history', label: 'History' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'sports', label: 'Sports' },
  { value: 'music', label: 'Music' },
  { value: 'travel', label: 'Travel' },
  { value: 'food', label: 'Food & Cooking' },
  { value: 'self-improvement', label: 'Self-Improvement' },
  { value: 'fiction', label: 'Fiction & Stories' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'kids', label: 'Kids & Family' },
  { value: 'other', label: 'Other' },
]

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

const typeLabels: Record<string, string> = {
  course: 'Course',
  podcast: 'Podcast',
  audiobook: 'Audiobook',
  video_series: 'Video Series',
}

export default function SeriesListPage() {
  const navigate = useNavigate()
  const { series, loading, fetchSeries, createSeries } = useSeriesStore()
  const [showCreate, setShowCreate] = useState(false)
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
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchSeries()
  }, [fetchSeries])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const authors = form.authors.map((t) => t.text).filter(Boolean)
      const tags = form.tags.map((t) => t.text).filter(Boolean)
      const created = await createSeries({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        language: form.language,
        authors: authors.length ? authors : undefined,
        category: form.category.trim() || undefined,
        tags: tags.length ? tags : undefined,
        level: form.level || undefined,
      })
      setShowCreate(false)
      setForm({ title: '', description: '', type: 'course', language: 'en', authors: [], category: '', tags: [], level: '' })
      navigate(`/series/${created.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Series</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Series
        </Button>
      </div>

      {loading && series.length === 0 ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Library className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No series yet</h2>
          <p className="text-muted-foreground mb-4">Create your first series to get started.</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Series
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer transition-colors hover:border-foreground/20"
              onClick={() => navigate(`/series/${s.id}`)}
            >
              {s.coverPath ? (
                <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                  <CoverImage filePath={s.coverPath} alt={s.title} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted flex items-center justify-center">
                  <Library className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <CardContent className="p-4">
                <h3 className="font-semibold truncate">{s.title}</h3>
                {s.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary">{typeLabels[s.type] ?? s.type}</Badge>
                  <Badge variant="outline">{s.language.toUpperCase()}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Series Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent onClose={() => setShowCreate(false)}>
          <DialogHeader>
            <DialogTitle>Create Series</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Series title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  options={typeOptions}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Series['type'] }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  id="language"
                  options={languageOptions}
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select
                  id="level"
                  options={levelOptions}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: e.target.value as SeriesLevel | '' }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  id="category"
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
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
