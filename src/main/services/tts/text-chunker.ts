/**
 * Split text into chunks by paragraph, greedily packing as many paragraphs
 * as possible into each chunk to preserve the model's natural sentence
 * breaks and inter-paragraph pauses.
 *
 * Shared across TTS providers that need to split long text.
 */
export function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)

  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const separator = current ? '\n\n' : ''
    if (current.length + separator.length + para.length <= maxChars) {
      current += separator + para
    } else {
      if (current) chunks.push(current)
      if (para.length > maxChars) {
        // Paragraph too long — split by sentence
        const sentences = para.match(/[^.!?]*[.!?]+\s*/g) || [para]
        let sentBuf = ''
        for (const sent of sentences) {
          if (sentBuf.length + sent.length > maxChars && sentBuf) {
            chunks.push(sentBuf.trimEnd())
            sentBuf = sent
          } else {
            sentBuf += sent
          }
        }
        current = sentBuf
      } else {
        current = para
      }
    }
  }
  if (current) chunks.push(current)

  return chunks.filter((c) => c.length > 0)
}
