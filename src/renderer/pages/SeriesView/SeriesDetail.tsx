import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Scissors, Trash2, Pencil, Play, MoreVertical, ImagePlus, Library } from 'lucide-react'
import { TagInput, type Tag } from '../../components/TagInput'
import { useSeriesStore } from '../../stores/seriesStore'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useTranscriptionStore } from '../../stores/transcriptionStore'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Progress } from '../../components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table'
import { Separator } from '../../components/ui/separator'
import { CoverImage } from '../../components/CoverImage'
import type { Series, SeriesLevel, Episode } from '../../../shared/types'

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

const statusColors: Record<string, string> = {
  ready: 'bg-blue-500/20 text-blue-400',
  transcribing: 'bg-yellow-500/20 text-yellow-400',
  transcribed: 'bg-green-500/20 text-green-400',
}

const publishColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  preview: 'bg-orange-500/20 text-orange-400',
  published: 'bg-green-500/20 text-green-400',
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { series, fetchSeries, updateSeries, deleteSeries, uploadCover } = useSeriesStore()
  const { episodes, loading: episodesLoading, fetchEpisodes, createEpisode, deleteEpisode } = useEpisodeStore()
  const progresses = useTranscriptionStore((s) => s.progresses)
  const completedIds = useTranscriptionStore((s) => s.completedIds)
  const ackCompleted = useTranscriptionStore((s) => s.ackCompleted)

  const currentSeries = series.find((s) => s.id === id)

  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    type: 'course' as Series['type'],
    language: 'en',
    authors: [] as Tag[],
    category: '',
    tags: [] as Tag[],
    level: '' as SeriesLevel | '',
  })
  const [saving, setSaving] = useState(false)

  const [showDelete, setShowDelete] = useState(false)
  const [showNewEpisode, setShowNewEpisode] = useState(false)
  const [newEpTitle, setNewEpTitle] = useState('')
  const [creatingEp, setCreatingEp] = useState(false)

  useEffect(() => {
    if (!currentSeries) fetchSeries()
  }, [currentSeries, fetchSeries])

  useEffect(() => {
    if (id) fetchEpisodes(id)
  }, [id, fetchEpisodes])

  // When any episode in this series finishes transcription, ack + refetch
  // so the status badge updates from "transcribing" → "transcribed".
  useEffect(() => {
    if (!id || completedIds.length === 0) return
    // Find episode ids that belong to this series
    const seriesEpIds = new Set(episodes.map((ep) => ep.id))
    const matched = completedIds.filter((cid) => seriesEpIds.has(cid))
    if (matched.length === 0) return
    matched.forEach(ackCompleted)
    fetchEpisodes(id)
  }, [completedIds, id, episodes, ackCompleted, fetchEpisodes])

  useEffect(() => {
    if (currentSeries) {
      setEditForm({
        title: currentSeries.title,
        description: currentSeries.description ?? '',
        type: currentSeries.type,
        language: currentSeries.language,
        authors: (currentSeries.authors ?? []).map((a) => ({ id: a, text: a })),
        category: currentSeries.category ?? '',
        tags: (currentSeries.tags ?? []).map((t) => ({ id: t, text: t })),
        level: currentSeries.level ?? '',
      })
    }
  }, [currentSeries])

  if (!currentSeries) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const handleSaveEdit = async () => {
    if (!id || !editForm.title.trim()) return
    setSaving(true)
    try {
      const authors = editForm.authors.map((t) => t.text).filter(Boolean)
      const tags = editForm.tags.map((t) => t.text).filter(Boolean)
      await updateSeries(id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || undefined,
        type: editForm.type,
        language: editForm.language,
        authors: authors.length ? authors : undefined,
        category: editForm.category.trim() || undefined,
        tags: tags.length ? tags : undefined,
        level: editForm.level || undefined,
      })
      setShowEdit(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    await deleteSeries(id)
    navigate('/series')
  }

  const handleNewEpisode = async () => {
    if (!id) return
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [
        { name: 'Media Files', extensions: ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'mkv', 'avi', 'mov'] },
      ],
    })
    if (!filePath) return

    setShowNewEpisode(true)
    setNewEpTitle('')
  }

  const handleCreateEpisode = async (filePath: string) => {
    if (!id || !newEpTitle.trim()) return
    setCreatingEp(true)
    try {
      const isVideo = /\.(mp4|webm|mkv|avi|mov)$/i.test(filePath)
      const metadata = await window.electronAPI.splitter.getMetadata(filePath)
      const episode = await createEpisode({
        seriesId: id,
        title: newEpTitle.trim(),
        order: episodes.length,
        mimeType: isVideo ? 'video' : 'audio',
        localPath: filePath,
        duration: metadata.duration,
        source: { type: 'direct', origin: filePath },
        status: 'ready',
        publishStatus: 'draft',
      })
      setShowNewEpisode(false)
      navigate(`/series/${id}/episodes/${episode.id}`)
    } finally {
      setCreatingEp(false)
    }
  }

  const handleSplitImport = async () => {
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [
        { name: 'Media Files', extensions: ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'mkv', 'avi', 'mov'] },
      ],
    })
    if (!filePath) return
    navigate(`/split?file=${encodeURIComponent(filePath)}&seriesId=${id}`)
  }

  const handleDeleteEpisode = async (episodeId: string) => {
    await deleteEpisode(episodeId)
  }

  const handleUploadCover = async () => {
    if (!id) return
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
      ],
    })
    if (!filePath) return
    await uploadCover(id, filePath)
  }

  // For the New Episode flow we need to track the selected file path
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const handleSelectFileAndShowDialog = async () => {
    const filePath = await window.electronAPI.dialog.openFile({
      filters: [
        { name: 'Media Files', extensions: ['mp3', 'mp4', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'mkv', 'avi', 'mov'] },
      ],
    })
    if (!filePath) return
    setSelectedFile(filePath)
    setNewEpTitle(filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '')
    setShowNewEpisode(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/series')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 cursor-pointer"
          onClick={handleUploadCover}
          title="Click to change cover"
        >
          {currentSeries.coverPath ? (
            <CoverImage filePath={currentSeries.coverPath} alt={currentSeries.title} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{currentSeries.title}</h1>
          {currentSeries.description && (
            <p className="text-sm text-muted-foreground mt-1">{currentSeries.description}</p>
          )}
          {(currentSeries.authors?.length || currentSeries.category) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {currentSeries.authors?.length && <span>By {currentSeries.authors.join(', ')}</span>}
              {currentSeries.authors?.length && currentSeries.category && <span>·</span>}
              {currentSeries.category && <span>{currentSeries.category}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{typeOptions.find((t) => t.value === currentSeries.type)?.label ?? currentSeries.type}</Badge>
          <Badge variant="outline">{currentSeries.language.toUpperCase()}</Badge>
          {currentSeries.level && (
            <Badge variant="outline">{levelOptions.find((l) => l.value === currentSeries.level)?.label ?? currentSeries.level}</Badge>
          )}
          {currentSeries.tags?.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
          <Button variant="ghost" size="icon" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Episode Actions */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Episodes ({episodes.length})</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSplitImport}>
            <Scissors className="h-4 w-4 mr-2" />
            Split & Import
          </Button>
          <Button onClick={handleSelectFileAndShowDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Episode
          </Button>
        </div>
      </div>

      {/* Episodes Table */}
      {episodesLoading && episodes.length === 0 ? (
        <div className="text-muted-foreground">Loading episodes...</div>
      ) : episodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Play className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No episodes yet. Create one or use Split & Import.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-24">Duration</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Publish</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {episodes.map((ep) => (
              <TableRow
                key={ep.id}
                className="cursor-pointer"
                onClick={() => navigate(`/series/${id}/episodes/${ep.id}`)}
              >
                <TableCell className="text-muted-foreground">{ep.order + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{ep.title}</div>
                  {ep.lastError && (
                    <div className="text-xs text-destructive mt-0.5 truncate max-w-xs">{ep.lastError.message}</div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDuration(ep.duration)}</TableCell>
                <TableCell>
                  {progresses[ep.id] ? (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        {progresses[ep.id].stage === 'transcribing' && 'Transcribing...'}
                        {progresses[ep.id].stage === 'nlp' && 'NLP processing...'}
                        {!progresses[ep.id].stage && 'Starting...'}
                      </span>
                      <Progress value={progresses[ep.id].percent} className="h-1.5" />
                    </div>
                  ) : (
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${statusColors[ep.status] ?? ''}`}>
                      {ep.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${publishColors[ep.publishStatus] ?? ''}`}>
                    {ep.publishStatus}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteEpisode(ep.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Edit Series Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent onClose={() => setShowEdit(false)}>
          <DialogHeader>
            <DialogTitle>Edit Series</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cover Image</Label>
              <div
                className="flex items-center justify-center w-full h-32 rounded-lg border border-dashed border-input bg-muted/50 cursor-pointer hover:bg-muted transition-colors overflow-hidden"
                onClick={handleUploadCover}
              >
                {currentSeries.coverPath ? (
                  <CoverImage filePath={currentSeries.coverPath} alt="Cover" className="h-full w-full object-cover" />
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
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select
                  id="edit-type"
                  options={typeOptions}
                  value={editForm.type}
                  onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value as Series['type'] }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-language">Language</Label>
                <Select
                  id="edit-language"
                  options={languageOptions}
                  value={editForm.language}
                  onChange={(e) => setEditForm((f) => ({ ...f, language: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-level">Level</Label>
                <Select
                  id="edit-level"
                  options={levelOptions}
                  value={editForm.level}
                  onChange={(e) => setEditForm((f) => ({ ...f, level: e.target.value as SeriesLevel | '' }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select
                  id="edit-category"
                  options={categoryOptions}
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Authors</Label>
              <TagInput
                placeholder="Type and press Enter"
                tags={editForm.authors}
                setTags={(newTags) => setEditForm((f) => ({ ...f, authors: newTags }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <TagInput
                placeholder="Type and press Enter"
                tags={editForm.tags}
                setTags={(newTags) => setEditForm((f) => ({ ...f, tags: newTags }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.title.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent onClose={() => setShowDelete(false)}>
          <DialogHeader>
            <DialogTitle>Delete Series</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{currentSeries.title}"? This will also delete all episodes in this series. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Episode Dialog */}
      <Dialog open={showNewEpisode} onOpenChange={setShowNewEpisode}>
        <DialogContent onClose={() => setShowNewEpisode(false)}>
          <DialogHeader>
            <DialogTitle>New Episode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ep-title">Episode Title</Label>
              <Input
                id="ep-title"
                placeholder="Episode title"
                value={newEpTitle}
                onChange={(e) => setNewEpTitle(e.target.value)}
              />
            </div>
            {selectedFile && (
              <div className="text-sm text-muted-foreground">
                File: {selectedFile.split('/').pop()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewEpisode(false)}>Cancel</Button>
            <Button
              onClick={() => selectedFile && handleCreateEpisode(selectedFile)}
              disabled={creatingEp || !newEpTitle.trim()}
            >
              {creatingEp ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
