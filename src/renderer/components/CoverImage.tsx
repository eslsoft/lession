import React, { useEffect, useState } from 'react'

interface CoverImageProps {
  filePath?: string
  alt?: string
  className?: string
  onClick?: () => void
}

export function CoverImage({ filePath, alt = 'Cover', className = '', onClick }: CoverImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!filePath) {
      setObjectUrl(null)
      return
    }

    let revoked = false
    let url: string | null = null

    window.electronAPI.media
      .readFile(filePath)
      .then((buffer) => {
        if (revoked) return
        const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          gif: 'image/gif',
        }
        const mime = mimeMap[ext] ?? 'image/png'
        const blob = new Blob([buffer], { type: mime })
        url = URL.createObjectURL(blob)
        setObjectUrl(url)
      })
      .catch(() => {
        setObjectUrl(null)
      })

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [filePath])

  if (!objectUrl) return null

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    />
  )
}
