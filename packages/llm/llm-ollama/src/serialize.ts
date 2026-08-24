/**
 * Serialize harness `GenerateOptions` into an Ollama `/api/chat` request
 * body. Mirrors `llm-deepseek/serialize.ts`'s role but targets Ollama's
 * native wire shape (`messages`, `tools`, `stream`, `keep_alive`, `options`)
 * rather than OpenAI-compatible `chat/completions`.
 *
 * @module dsh-llm-ollama/serialize
 */
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

export interface RequestDefaults {
  /** `'disabled'` forces off-only reasoning for models that support thinking mode. */
  thinking: 'enabled' | 'disabled'
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: unknown[]
}

interface OllamaChatBody {
  model: string
  messages: OllamaMessage[]
  tools?: unknown[]
  stream: true
  keep_alive: string | number
  options?: { num_predict?: number }
  think?: boolean
}

function toOllamaMessage(message: GenerateOptions['messages'][number]): OllamaMessage {
  const images = message.attachments
    ?.filter(attachment => attachment.kind === 'image')
    .map(attachment => attachment.base64)
  return {
    role: message.role,
    content: message.text ?? '',
    ...images !== undefined && images.length > 0 ? { images } : {},
    ...message.toolCalls !== undefined ? { tool_calls: message.toolCalls } : {},
  }
}

export function serializeRequest(
  options: GenerateOptions,
  defaults: RequestDefaults,
  keepAlive: string | number,
): OllamaChatBody {
  return {
    model: options.model,
    messages: options.messages.map(toOllamaMessage),
    ...options.tools !== undefined && options.tools.length > 0 ? { tools: options.tools } : {},
    stream: true,
    keep_alive: keepAlive,
    ...options.maxTokens !== undefined ? { options: { num_predict: options.maxTokens } } : {},
    ...defaults.thinking === 'disabled' ? { think: false } : {},
  }
}
