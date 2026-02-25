export const typeOptions = [
  { value: 'course', label: 'Course' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'audiobook', label: 'Audiobook' },
  { value: 'video_series', label: 'Video Series' },
]

export const levelOptions = [
  { value: '', label: 'None' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const categoryOptions = [
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

export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
]

export const statusColors: Record<string, string> = {
  ready: 'bg-blue-500/20 text-blue-400',
  transcribing: 'bg-yellow-500/20 text-yellow-400',
  transcribed: 'bg-green-500/20 text-green-400',
}

export const publishColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  preview: 'bg-orange-500/20 text-orange-400',
  published: 'bg-green-500/20 text-green-400',
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
