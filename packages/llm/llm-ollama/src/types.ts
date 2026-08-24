/** Wire types for Ollama's `/api/chat` streaming responses and error bodies. */

export interface OllamaToolCallWire {
  function: { name: string; arguments: Record<string, unknown> }
}

export interface OllamaMessageWire {
  role: string
  content: string
  tool_calls?: OllamaToolCallWire[]
}

export interface OllamaChatChunk {
  model: string
  message?: OllamaMessageWire
  done: boolean
  done_reason?: string
  /** Populated only on the final chunk (`done: true`). */
  eval_count?: number
  prompt_eval_count?: number
}

/** Ollama's flat error body -- simpler than DeepSeek's nested `{ code, type, message }`. */
export interface WireError {
  error?: string
}
