/**
 * Translate parsed Ollama NDJSON chunks into harness `StreamChunk`s. Mirrors
 * `llm-deepseek/translate.ts`'s role but reads Ollama's flatter chunk shape
 * (`message.content` deltas, `message.tool_calls` only on the final chunk,
 * `done`/`eval_count` for usage) instead of OpenAI-style `choices[].delta`.
 *
 * @module dsh-llm-ollama/translate
 */
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { OllamaChatChunk } from './types.ts'

export async function* translate(chunks: AsyncIterable<unknown>): AsyncIterable<StreamChunk> {
  for await (const raw of chunks) {
    const chunk = raw as OllamaChatChunk
    const message = chunk.message

    if (message?.content !== undefined && message.content.length > 0) {
      yield { type: 'text-delta', text: message.content }
    }

    if (message?.tool_calls !== undefined) {
      for (const call of message.tool_calls) {
        yield {
          type: 'tool-call',
          name: call.function.name,
          arguments: call.function.arguments,
        }
      }
    }

    if (chunk.done) {
      yield {
        type: 'finish',
        finishReason: chunk.done_reason === 'stop' ? 'stop' : 'other',
        ...chunk.eval_count !== undefined || chunk.prompt_eval_count !== undefined
          ? {
            usage: {
              inputTokens: chunk.prompt_eval_count ?? 0,
              outputTokens: chunk.eval_count ?? 0,
            },
          }
          : {},
      }
    }
  }
}
