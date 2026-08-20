# NexLM Harness

[English](README.md) | 中文

NexLM Harness 是来自 [NexLM](https://nex-lm.vercel.app) 的独立 agent harness。它始于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，并正在被重新定义为能力更强的 NexLM 运行时。

它采用 **一切皆插件** 的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动。

## 状态

这是一个 NexLM 项目。代码迭代很快，可能出现兼容性破坏变更。

## 路线图

NexLM Harness 计划加入以下功能：

- Ollama 模型管理器：检测已安装模型、显示模型能力并快速切换模型。
- 对话文件夹、搜索、重命名、置顶以及导入/导出。
- 提示词预设：保存可复用的系统提示词和编码工作流。
- 模型对比：向多个本地模型发送同一提示词并比较结果。
- 内置项目上下文地图：总结文件、依赖关系和近期变更。
- 工具活动时间线：更清晰地展示批准、取消和重试控制。
- 扩展/插件市场：支持提供方、工具、主题和工作流。
- 本地评测模式：使用保存的基准测试模型。
- 更完善的离线模式：清晰显示模型加载和连接状态。
- Git 工作流工具：创建分支、审查差异、起草提交和准备 PR。
- 内置浏览器和实时网页视图。

## 运行

### 从 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认在 `http://127.0.0.1:3080` 启动 Web UI。见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

```sh
git clone https://github.com/besmart12349/NexLM-Harness.git
cd NexLM-Harness
pnpm install
pnpm run build
pnpm dsh web
```

## 相关

- [NexLM](https://github.com/besmart12349/NexLM)
- [PrismCLI](https://github.com/besmart12349/PrismCLI)
- 原始项目：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

从[开发指南](docs/development.md)和[架构文档](docs/architecture.md)开始。

对于 agent，请遵循 [AGENTS.md](AGENTS.md)。

## 许可

[MIT](LICENSE)

第三方依赖及其许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
