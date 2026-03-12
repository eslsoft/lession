import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Type, BookOpen, Loader2, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { useEpisodeStore } from '../../stores/episodeStore'
import type { ExtractedBook, BookImport } from '@shared/types'

type Tab = 'text' | 'book'

export default function TextToSpeechPage() {
  const { id: seriesId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { fetchEpisodes } = useEpisodeStore()

  const initialTab = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(initialTab === 'book' ? 'book' : 'text')

  // Text tab state
  const [title, setTitle] = useState('')
  const [textContent, setTextContent] = useState('')

  // Book tab state
  const [extractedBook, setExtractedBook] = useState<ExtractedBook | null>(null)
  const [chapters, setChapters] = useState<{ title: string; text: string; selected: boolean }[]>([])
  const [extracting, setExtracting] = useState(false)

  // Shared state
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeImport, setActiveImport] = useState<BookImport | null>(null)

  // Subscribe to book import progress
  useEffect(() => {
    const unsub = window.electronAPI.bookImport.onProgress((data) => {
      if (data.seriesId !== seriesId) return
      setActiveImport(data)
      if (data.status === 'done' || data.status === 'error' || data.status === 'cancelled') {
        if (seriesId) fetchEpisodes(seriesId)
      }
    })
    return unsub
  }, [seriesId, fetchEpisodes])

  // Sync chapters when extractedBook changes
  useEffect(() => {
    if (extractedBook) {
      setChapters(extractedBook.chapters.map((ch) => ({
        title: ch.title,
        text: ch.text,
        selected: true,
      })))
    }
  }, [extractedBook])

  const selectedCount = chapters.filter((ch) => ch.selected).length

  const handleSelectBook = async () => {
    setExtracting(true)
    setError(null)
    try {
      const filePath = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'eBooks', extensions: ['epub', 'pdf'] }],
      })
      if (!filePath) {
        setExtracting(false)
        return
      }
      const result = await window.electronAPI.bookImport.extract(filePath)
      setExtractedBook(result)
    } catch (err) {
      setError(`Failed to extract book: ${(err as Error).message}`)
    } finally {
      setExtracting(false)
    }
  }

  const toggleChapter = (index: number) => {
    setChapters((prev) => prev.map((ch, i) => i === index ? { ...ch, selected: !ch.selected } : ch))
  }

  const toggleAll = () => {
    const allSelected = chapters.every((ch) => ch.selected)
    setChapters((prev) => prev.map((ch) => ({ ...ch, selected: !allSelected })))
  }

  const updateChapterTitle = (index: number, t: string) => {
    setChapters((prev) => prev.map((ch, i) => i === index ? { ...ch, title: t } : ch))
  }

  const handleGenerateFromBook = async () => {
    if (!seriesId || !extractedBook) return
    const selected = chapters.filter((ch) => ch.selected).map(({ title: t, text }) => ({ title: t, text }))
    if (selected.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const bookImport = await window.electronAPI.bookImport.generate(seriesId, extractedBook.epubPath, selected)
      setActiveImport(bookImport)
      fetchEpisodes(seriesId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateFromText = async () => {
    if (!seriesId || !title.trim() || !textContent.trim()) return
    // Use the bookImport.generate API with a synthetic chapter
    // For now, we generate a single episode from the pasted text
    setGenerating(true)
    setError(null)
    try {
      const chaptersToGenerate = [{ title: title.trim(), text: textContent.trim() }]
      // We need an epubPath — pass empty string since it's raw text
      const bookImport = await window.electronAPI.bookImport.generate(seriesId, '', chaptersToGenerate)
      setActiveImport(bookImport)
      fetchEpisodes(seriesId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const canGenerateText = tab === 'text' && title.trim() && textContent.trim() && !generating
  const canGenerateBook = tab === 'book' && selectedCount > 0 && !generating

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/series/${seriesId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Text to Speech</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-border">
        <button
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'text'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('text')}
        >
          <Type className="h-4 w-4" />
          Paste Text
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'book'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('book')}
        >
          <BookOpen className="h-4 w-4" />
          Import Book
        </button>
      </div>

      {/* Import progress banner */}
      {activeImport && activeImport.status !== 'done' && activeImport.status !== 'cancelled' && (
        <div className="rounded-lg border bg-purple-500/5 border-purple-500/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-purple-400">
              {activeImport.status === 'pending' && 'Preparing...'}
              {activeImport.status === 'extracting' && 'Extracting chapters...'}
              {activeImport.status === 'generating' && `Generating audio: ${activeImport.completedChapters}/${activeImport.totalChapters} chapters`}
              {activeImport.status === 'error' && `Error: ${activeImport.lastError}`}
            </span>
            {(activeImport.status === 'generating' || activeImport.status === 'extracting') && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => window.electronAPI.bookImport.cancel(activeImport.id)}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Paste Text Tab */}
      {tab === 'text' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="tts-title">Episode Title</Label>
            <Input
              id="tts-title"
              placeholder="Enter episode title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            <Label>Text Content</Label>
            <Textarea
              placeholder="Paste your text content here. The text will be converted to speech using TTS."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="flex-1 min-h-[200px] resize-none"
            />
            <span className="text-xs text-muted-foreground">
              {textContent.length.toLocaleString()} characters
            </span>
          </div>
        </div>
      )}

      {/* Import Book Tab */}
      {tab === 'book' && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Book file selector */}
          <div className="space-y-2">
            <Label>Book File</Label>
            {extractedBook ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">{extractedBook.title}</span>
                  {extractedBook.author !== 'Unknown' && (
                    <span className="text-xs text-muted-foreground">by {extractedBook.author}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{chapters.length} chapters extracted</span>
                  <Button variant="ghost" size="sm" onClick={handleSelectBook} disabled={extracting}>
                    Change
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={handleSelectBook} disabled={extracting} className="w-full justify-center h-20 border-dashed">
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting chapters...
                  </>
                ) : (
                  <>
                    <BookOpen className="h-4 w-4 mr-2" />
                    Select EPUB or PDF file
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Chapter list */}
          {chapters.length > 0 && (
            <div className="flex flex-col gap-1.5 flex-1 min-h-0">
              <div className="flex items-center justify-between">
                <Label>Select Chapters</Label>
                <span className="text-xs text-muted-foreground">
                  {selectedCount} of {chapters.length} chapters selected
                </span>
              </div>
              <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-[200px]">
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
                  <span className="flex-1">Chapter</span>
                  <span className="w-20 text-right">Length</span>
                </div>

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
                      onChange={(e) => updateChapterTitle(i, e.target.value)}
                      className="flex-1 h-8 text-sm"
                      disabled={!ch.selected}
                    />
                    <span className="w-20 text-right text-xs text-muted-foreground flex-shrink-0">
                      {ch.text.length > 1000 ? `${(ch.text.length / 1000).toFixed(1)}k` : ch.text.length} chars
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate(`/series/${seriesId}`)}>
          Cancel
        </Button>
        {tab === 'text' ? (
          <Button onClick={handleGenerateFromText} disabled={!canGenerateText}>
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {generating ? 'Generating...' : 'Generate Episode'}
          </Button>
        ) : (
          <Button onClick={handleGenerateFromBook} disabled={!canGenerateBook}>
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {generating ? 'Starting...' : `Generate ${selectedCount} Episode${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
          {error}
        </div>
      )}
    </div>
  )
}
