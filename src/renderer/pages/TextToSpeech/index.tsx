import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Type, BookOpen, Loader2, Sparkles, Play, Square, Volume2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select } from '../../components/ui/select'
import { useEpisodeStore } from '../../stores/episodeStore'
import { useConfigStore } from '../../stores/configStore'
import type { ExtractedBook, BookImport, ServiceConfig } from '@shared/types'
import { getVoicesForEngine, getDefaultVoice, getModelsForEngine, getDefaultModel } from '@shared/engines'

type Tab = 'text' | 'book'

const MAX_PREVIEW_MS = 30_000

export default function TextToSpeechPage() {
  const { id: seriesId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { fetchEpisodes } = useEpisodeStore()
  const { config } = useConfigStore()

  const initialTab = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(initialTab === 'book' ? 'book' : 'text')

  // Available TTS services from config
  const ttsServices = config?.services?.filter((s) => s.category === 'tts') ?? []

  // Voice settings — service-based
  const [serviceId, setServiceId] = useState(ttsServices[0]?.id ?? '')
  const selectedService = ttsServices.find((s) => s.id === serviceId) ?? ttsServices[0]
  const [voice, setVoice] = useState(selectedService ? getDefaultVoice(selectedService.engine, selectedService.options.voices) : '')
  const [speed, setSpeed] = useState(1.0)
  const modelOptions = selectedService ? getModelsForEngine(selectedService.engine) : []
  const [model, setModel] = useState(selectedService?.options.model ?? getDefaultModel(selectedService?.engine ?? ''))

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

  // Preview state
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const disposeAudio = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => () => disposeAudio(), [disposeAudio])

  const handlePreview = useCallback(async (id: string, text?: string) => {
    if (!serviceId) return
    disposeAudio()
    setPreviewingId(id)
    try {
      const audioPath = await window.electronAPI.bookImport.preview(serviceId, voice, speed, model || undefined, text)
      const audio = new Audio(`local-media://localhost${encodeURI(audioPath)}`)
      audio.onended = () => setPlayingId(null)
      audio.play()
      audioRef.current = audio
      setPlayingId(id)
      timerRef.current = setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.pause()
          setPlayingId(null)
        }
      }, MAX_PREVIEW_MS)
    } catch (err) {
      console.error('TTS preview failed:', err)
    } finally {
      setPreviewingId(null)
    }
  }, [serviceId, voice, speed, disposeAudio])

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
    if (!seriesId || !extractedBook || !serviceId) return
    const selected = chapters.filter((ch) => ch.selected).map(({ title: t, text }) => ({ title: t, text }))
    if (selected.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const bookImport = await window.electronAPI.bookImport.generate(seriesId, extractedBook.epubPath, selected, serviceId, voice, speed, model || undefined)
      setActiveImport(bookImport)
      fetchEpisodes(seriesId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateFromText = async () => {
    if (!seriesId || !title.trim() || !textContent.trim() || !serviceId) return
    setGenerating(true)
    setError(null)
    try {
      const chaptersToGenerate = [{ title: title.trim(), text: textContent.trim() }]
      const bookImport = await window.electronAPI.bookImport.generate(seriesId, '', chaptersToGenerate, serviceId, voice, speed, model || undefined)
      setActiveImport(bookImport)
      fetchEpisodes(seriesId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const canGenerateText = tab === 'text' && title.trim() && textContent.trim() && !generating && !!serviceId
  const canGenerateBook = tab === 'book' && selectedCount > 0 && !generating && !!serviceId
  const voiceOptions = selectedService ? getVoicesForEngine(selectedService.engine, selectedService.options.voices) : []

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/series/${seriesId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Text to Speech</h1>
      </div>

      {/* Voice Settings */}
      <div className="flex items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Service</Label>
          <Select
            value={serviceId}
            onChange={(e) => {
              const id = e.target.value
              setServiceId(id)
              const svc = ttsServices.find((s) => s.id === id)
              if (svc) {
                setVoice(getDefaultVoice(svc.engine, svc.options.voices))
                setModel(svc.options.model ?? getDefaultModel(svc.engine))
              }
              disposeAudio()
            }}
            options={ttsServices.map((s) => ({ value: s.id, label: s.name }))}
            className="w-44"
          />
        </div>
        {modelOptions.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select
              value={model}
              onChange={(e) => { setModel(e.target.value); disposeAudio() }}
              options={modelOptions}
              className="w-36"
            />
          </div>
        )}
        <div className="space-y-1 flex-1">
          <Label className="text-xs text-muted-foreground">Voice</Label>
          <Select
            value={voice}
            onChange={(e) => { setVoice(e.target.value); disposeAudio() }}
            options={voiceOptions}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <Input
            type="number"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value) || 1.0)}
            className="w-20"
          />
        </div>
        <PreviewButton
          id="voice"
          previewingId={previewingId}
          playingId={playingId}
          onPreview={() => handlePreview('voice')}
          onStop={disposeAudio}
          label="Try Voice"
          disabled={!serviceId}
        />
      </div>

      {ttsServices.length === 0 && (
        <div className="text-sm text-amber-500 bg-amber-500/10 rounded-md px-4 py-3">
          No TTS services configured. Please add one in Settings.
        </div>
      )}

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
          <div className="flex items-end gap-3">
            <div className="space-y-2 flex-1">
              <Label htmlFor="tts-title">Episode Title</Label>
              <Input
                id="tts-title"
                placeholder="Enter episode title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <PreviewButton
              id="text"
              previewingId={previewingId}
              playingId={playingId}
              onPreview={() => handlePreview('text', textContent)}
              onStop={disposeAudio}
              disabled={!textContent.trim() || !serviceId}
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
                  <span className="w-16 text-center">Preview</span>
                </div>

                {chapters.map((ch, i) => {
                  const chId = String(i)
                  return (
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
                      <div className="w-16 flex justify-center flex-shrink-0">
                        <PreviewButton
                          id={chId}
                          previewingId={previewingId}
                          playingId={playingId}
                          onPreview={() => handlePreview(chId, ch.text)}
                          onStop={disposeAudio}
                          compact
                        />
                      </div>
                    </div>
                  )
                })}
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

// ── Preview Button Component ──

function PreviewButton({
  id,
  previewingId,
  playingId,
  onPreview,
  onStop,
  label,
  compact,
  disabled,
}: {
  id: string
  previewingId: string | null
  playingId: string | null
  onPreview: () => void
  onStop: () => void
  label?: string
  compact?: boolean
  disabled?: boolean
}) {
  const isPreviewing = previewingId === id
  const isPlaying = playingId === id

  if (compact) {
    if (isPreviewing) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    }
    if (isPlaying) {
      return (
        <button onClick={onStop} className="text-muted-foreground hover:text-foreground transition-colors">
          <Square className="h-3.5 w-3.5" />
        </button>
      )
    }
    return (
      <button
        onClick={onPreview}
        disabled={disabled}
        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
      >
        <Play className="h-3.5 w-3.5" />
      </button>
    )
  }

  if (isPlaying) {
    return (
      <Button variant="outline" size="sm" onClick={onStop}>
        <Square className="mr-1 h-3 w-3" /> Stop
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={onPreview} disabled={isPreviewing || disabled}>
      {isPreviewing ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : (
        <Volume2 className="mr-1 h-3 w-3" />
      )}
      {label ?? 'Preview'}
    </Button>
  )
}
