import React, { useState, useRef, useCallback } from 'react'

export interface Tag {
  id: string
  text: string
}

interface TagInputProps {
  tags: Tag[]
  setTags: (tags: Tag[]) => void
  placeholder?: string
}

export function TagInput({ tags, setTags, placeholder = 'Type and press Enter' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (tags.some((t) => t.text === trimmed)) return
      setTags([...tags, { id: crypto.randomUUID(), text: trimmed }])
      setInputValue('')
    },
    [tags, setTags],
  )

  const removeTag = useCallback(
    (id: string) => {
      setTags(tags.filter((t) => t.id !== id))
      setActiveIndex(null)
      inputRef.current?.focus()
    },
    [tags, setTags],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      e.preventDefault()
      if (activeIndex !== null) {
        const newTags = [...tags]
        newTags.splice(activeIndex, 1)
        setTags(newTags)
        setActiveIndex(activeIndex > 0 ? activeIndex - 1 : newTags.length > 0 ? 0 : null)
      } else {
        setActiveIndex(tags.length - 1)
      }
    } else if (e.key === 'ArrowLeft' && !inputValue) {
      e.preventDefault()
      setActiveIndex((prev) => (prev === null ? tags.length - 1 : prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'ArrowRight' && !inputValue) {
      e.preventDefault()
      if (activeIndex !== null) {
        setActiveIndex(activeIndex < tags.length - 1 ? activeIndex + 1 : null)
      }
    } else if (e.key === 'Escape') {
      setActiveIndex(null)
    } else {
      setActiveIndex(null)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (pasted.includes(',')) {
      e.preventDefault()
      pasted
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach(addTag)
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={tag.id}
          className={`inline-flex items-center gap-0.5 rounded-sm px-2 py-0.5 text-xs font-medium transition-colors ${
            i === activeIndex
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          }`}
        >
          {tag.text}
          <button
            type="button"
            className="ml-0.5 rounded-sm opacity-60 hover:opacity-100 focus:outline-none"
            onClick={(e) => {
              e.stopPropagation()
              removeTag(tag.id)
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => {
          addTag(inputValue)
          setActiveIndex(null)
        }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
