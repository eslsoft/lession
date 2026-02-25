import React from 'react'
import { ArrowLeft, Pencil, Trash2, ImagePlus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { CoverImage } from '../../components/CoverImage'
import { typeOptions, levelOptions } from './constants'
import type { Series } from '../../../shared/types'

interface SeriesHeaderProps {
  series: Series
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onUploadCover: () => void
}

export function SeriesHeader({ series, onBack, onEdit, onDelete, onUploadCover }: SeriesHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div
        className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 cursor-pointer"
        onClick={onUploadCover}
        title="Click to change cover"
      >
        {series.coverPath ? (
          <CoverImage filePath={series.coverPath} alt={series.title} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-bold">{series.title}</h1>
        {series.description && (
          <p className="text-sm text-muted-foreground mt-1">{series.description}</p>
        )}
        {(series.authors?.length || series.category) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            {series.authors?.length && <span>By {series.authors.join(', ')}</span>}
            {series.authors?.length && series.category && <span>·</span>}
            {series.category && <span>{series.category}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{typeOptions.find((t) => t.value === series.type)?.label ?? series.type}</Badge>
        <Badge variant="outline">{series.language.toUpperCase()}</Badge>
        {series.level && (
          <Badge variant="outline">{levelOptions.find((l) => l.value === series.level)?.label ?? series.level}</Badge>
        )}
        {series.tags?.map((tag) => (
          <Badge key={tag} variant="secondary">{tag}</Badge>
        ))}
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
