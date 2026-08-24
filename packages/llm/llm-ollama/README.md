# @deepseek-ai/dsh-llm-ollama

Ollama LLM adapter for NexLM Harness. Registers the `ollama` provider route
on `ctx.llm`, mirroring `llm-deepseek`'s registration/credential/retry
contract but talking to a local (or remote) Ollama server's `/api/chat`
endpoint instead of DeepSeek's OpenAI-compatible `chat/completions`.

## Key differences from `llm-deepseek`

- **Transport**: Ollama streams newline-delimited JSON (`ndjson.ts`), not
  SSE (`sse.ts`).
- **Credential**: no API key is required for local installs. `apiKeyEnv` is
  optional and only used for remote/proxied Ollama deployments behind an
  auth layer.
- **`keepAlive`**: forwarded on every request; governs how long Ollama keeps
  a model resident in memory after the call returns. This is the wire-level
  hook the NexLM Intent Engine's priority router uses to keep Boss agents
  resident (`-1`) while subagents unload quickly (`'2m'`) on constrained
  hardware.
- **Reasoning**: Ollama has no per-request effort dial; models that support
  "thinking" (e.g. `gpt-oss`) expose only on/off, not DeepSeek's four-tier
  `off`/`low`/`high`/`max`.

## Config

```yaml
plugins:
  llm-ollama:
    baseURL: http://127.0.0.1:11434   # defaults to localhost; $OLLAMA_BASE_URL also honored
    keepAlive: "5m"                    # or -1 to keep every registered model resident
    models:
      - id: gpt-oss:20b
        contextWindow: 128000
        supportsTools: true
      - id: gemma4:e4b
        inputModalities: [text, image]
        supportsTools: true
      - id: qwen3.5:4b
        supportsTools: true
```

## Files

- `adapter.ts` -- `OllamaAdapter`, the `LlmAdapter` implementation (fetch + streaming).
- `serialize.ts` -- harness `GenerateOptions` -> Ollama `/api/chat` request body.
- `ndjson.ts` -- newline-delimited JSON stream parser (Ollama's native wire format).
- `translate.ts` -- Ollama chunk -> harness `StreamChunk` translation.
- `types.ts` -- Ollama wire types (chat chunks, error body).
- `index.ts` -- Cordis plugin registration (`name`, `inject`, `Config`, `apply`).
