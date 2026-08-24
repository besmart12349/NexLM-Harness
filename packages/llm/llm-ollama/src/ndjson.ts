/**
 * Parse Ollama's newline-delimited JSON streaming wire format into a
 * sequence of parsed chunk objects. Ollama does not use SSE (`data: ...`
 * framing) like DeepSeek's OpenAI-compatible endpoint -- each line of the
 * response body is a complete standalone JSON object.
 *
 * @module dsh-llm-ollama/ndjson
 */

export async function* parseNdjson(
  body: ReadableStream<Uint8Array>,
  onComment: () => void,
): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      onComment()
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length === 0) continue
        yield JSON.parse(line)
      }
    }
    const trailing = buffer.trim()
    if (trailing.length > 0) yield JSON.parse(trailing)
  } finally {
    reader.releaseLock()
  }
}
