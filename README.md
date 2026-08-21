# NexLM Harness

English | [中文](README.zh.md)

NexLM Harness is a standalone agent harness from [NexLM](https://nex-lm.vercel.app). It started from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and is being redefined as a more capable NexLM runtime.

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis).

## Status

This repo is a NexLM project. The codebase is iterating quickly. Compatibility-breaking changes are possible.

## Roadmap

Planned features for NexLM Harness include:

- Ollama model manager: detect installed models, show capabilities, and switch models quickly.
- Conversation folders, search, rename, pinning, and export/import.
- Prompt presets for saving reusable system prompts and coding workflows.
- Model comparison: send one prompt to multiple local models and compare results.
- Built-in project context map with summaries of files, dependencies, and recent changes.
- Tool activity timeline with clearer approval, cancellation, and retry controls.
- Extension/plugin marketplace for providers, tools, themes, and workflows.
- Local evaluation mode for testing models against a saved benchmark.
- Better offline mode with clear model-loading and connection status.
- Git workflow tools for branch creation, diff review, commit drafting, and PR preparation.
- Built-in browser and live web view.

## Run

The command starts the Web UI at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

```sh
git clone https://github.com/besmart12349/NexLM-Harness.git
cd NexLM-Harness
pnpm install
pnpm run build
pnpm dsh web
```

## Updating

```sh
cd ~/NexLM-Harness
git pull origin master
pnpm install
pnpm run build
pnpm dsh web
```

## Related

- [NexLM](https://github.com/besmart12349/NexLM)
- [PrismCLI](https://github.com/besmart12349/PrismCLI)
- Original project: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
