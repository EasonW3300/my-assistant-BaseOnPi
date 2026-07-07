# My-Assistant

基于 [pi-agent](https://github.com/earendil-works/pi) SDK 构建的个人 AI 管家。

具备**灵魂设定**、**读写文件**、**收发邮件**、**定时任务**、**脚本执行**、**自动记忆管理**、**技能自动生成**等能力。支持 CLI 交互式聊天模式和后台守护进程模式。

---

## 架构设计

### 整体架构

采用 **Hybrid 混合架构**：核心 Agent 逻辑作为可复用模块（`@my-assistant/core`），外层包装 CLI 交互模式（`@my-assistant/cli`）和后台守护进程模式（`@my-assistant/daemon`）。

```
my-assistant-baseOnpi/
├── packages/
│   ├── core/                       # 核心引擎
│   │   ├── config.ts               # 配置管理器（首次运行检测）
│   │   ├── soul.ts                 # System Prompt 构建器
│   │   ├── tools/                  # 7 个自定义工具
│   │   ├── memory/                 # 记忆引擎 + 自动压缩
│   │   ├── skills/                 # 话题追踪 + Skill 自动生成
│   │   └── hooks/                  # 生命周期钩子（记忆/Skill）
│   ├── cli/                        # CLI 交互模式
│   └── daemon/                     # 后台守护进程
├── .pi/extensions/                 # pi-agent 扩展（跨兼容）
└── docs/superpowers/               # 设计规格书 + 实现计划
```

### 数据流

```
用户输入 → CLI (readline) / Daemon (cron/IMAP)
    → ConfigManager 加载配置
    → Soul 模块渲染 System Prompt
    → createAssistantAgent() 装配 Agent
        ├── 14 个工具（7 pi内置 + 7 自定义）
        ├── MemoryEngine（记忆检索/存储）
        ├── TopicTracker（话题重复检测）
        └── Hooks（turn_end 触发记忆提取 + Skill 检测）
    → pi-agent AgentHarness（Agent 运行循环）
    → 流式输出返回用户
```

### 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| 配置管理 | `config.ts` | 读写 `~/.my-assistant/config.json`，首次运行检测 `customized` 字段 |
| 灵魂设定 | `soul.ts` | 根据配置渲染 System Prompt（名字、性格、能力、记忆系统、行为准则） |
| 邮件工具 | `tools/email-tools.ts` | `send_email`（SMTP/nodemailer）、`check_inbox`（IMAP） |
| 定时任务 | `tools/cron-tools.ts` | `schedule_task`、`list_tasks`、`delete_task`，持久化到 `tasks.json` |
| 脚本执行 | `tools/bash-tools.ts` | `run_script`，写入临时文件 → bash 执行 → 清理 |
| 任务规划 | `tools/plan-tool.ts` | `plan_task`，LLM 指令模板，引导 Agent 拆解复杂任务 |
| 记忆引擎 | `memory/` | JSON 存储，关键词检索，三类型记忆（偏好/事实/任务），访问计数 |
| 记忆压缩 | `memory/compaction.ts` | 30天 + 低访问量条目 → LLM 聚合为摘要 |
| 话题追踪 | `skills/topic-tracker.ts` | 字符级 Jaccard 相似度，3次触发，持久化计数 |
| Skill 生成 | `skills/index.ts` | LLM 生成 SKILL.md → 写入 `.pi/skills/{slug}/` |
| 记忆钩子 | `hooks/memory-hooks.ts` | `turn_end` 触发：LLM 提取 → 逐关键词去重 → 写入记忆库 |
| Skill 钩子 | `hooks/skill-hooks.ts` | `turn_end` 触发：LLM 提取话题 → 追踪 → 触发 Skill 生成 |
| 入口点 | `index.ts` | `createAssistantAgent()` 装配全部模块为完整 Agent 会话 |

### 记忆系统

```
三类记忆：
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ preference  │  │    fact     │  │    task     │
│ 用户偏好     │  │ 事实信息     │  │ 待办任务     │
│ 咖啡/性格等  │  │ 生日/地址等  │  │ 带截止日期   │
└─────────────┘  └─────────────┘  └─────────────┘

生命周期：
对话中 ──→ turn_end hook ──→ LLM 提取 ──→ 关键词去重 ──→ memory.json
                                                    │
                          超过100条/30天 ──→ 自动压缩 ──→ summaries
```

### 技能自动生成流程

```
用户第1次提及某话题 ──→ TopicTracker: count=1
用户第2次提及相似话题 ──→ TopicTracker: count=2 (相似度>0.45)
用户第3次提及相似话题 ──→ TopicTracker: count=3, shouldGenerate=true
    → SkillGenerator.generate()
    → LLM 生成 SKILL.md
    → 保存到 .pi/skills/{slug}/SKILL.md
    → 通知用户
    → markGenerated() 防止重复生成
```

### 双层压缩策略

| 层级 | 触发条件 | 处理方式 | 存储 |
|------|---------|---------|------|
| 会话层 | 上下文 > 100K tokens | pi 内置 compact：LLM 总结旧对话回合 | session JSONL |
| 记忆层 | 条目 > 100 或 >30天 | 自定义：按类型分组，LLM 聚合为摘要 | memory.json summaries |

### 技术选型

| 层 | 技术 | 说明 |
|----|------|------|
| Agent 运行时 | `@earendil-works/pi-agent-core` | Agent 循环、工具调用、状态管理 |
| LLM 统一 API | `@earendil-works/pi-ai` | 多提供商支持（DeepSeek 默认） |
| Agent 会话 | `@earendil-works/pi-coding-agent` | 会话管理、SDK、资源加载 |
| TUI 界面 | Node.js readline | 交互式命令行聊天 |
| 参数校验 | TypeBox | JSON Schema 运行时校验 |
| 邮件发送 | nodemailer | SMTP 协议 |
| 邮件接收 | imap-simple | IMAP 协议（轮询 + IDLE） |
| 定时任务 | node-cron | 内存 cron 调度器 |
| 脚本执行 | cross-spawn | 跨平台 bash 执行 |
| 运行时 | Node.js >= 22.19.0, TypeScript 5.9 | |

---

## 部署方法

### 环境要求

- **Node.js** >= 22.19.0
- **npm** >= 10.x
- **操作系统**：macOS / Linux / WSL
- **可选**：SMTP/IMAP 邮箱账号（用于邮件功能）

### 1. 克隆项目

```bash
git clone https://github.com/EasonW3300/my-assistant-BaseOnPi.git
cd my-assistant-BaseOnPi
```

### 2. 安装依赖

```bash
npm install --ignore-scripts
```

### 3. 构建

```bash
npm run build
# 等价于: npm run build --workspaces
```

构建输出到各包的 `dist/` 目录：

```
packages/core/dist/     # 核心引擎
packages/cli/dist/      # CLI 入口 + 命令 + TUI
packages/daemon/dist/   # 守护进程
```

### 4. 全局安装（可选）

```bash
# 方式 A：npm link（推荐）
npm link --workspace=packages/cli

# 验证
my-assistant help

# 方式 B：手动创建符号链接
ln -sf "$(pwd)/packages/cli/bin/my-assistant" ~/.local/bin/my-assistant
```

确保 `~/.local/bin` 在 `$PATH` 中：
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 5. 验证安装

```bash
my-assistant help             # 显示 16 个子命令
my-assistant config show      # 查看配置
my-assistant memory stats     # 记忆统计
my-assistant daemon status    # 守护进程状态
```

### 6. 配置邮箱（可选）

```bash
my-assistant config edit
```

编辑 SMTP/IMAP 配置：

```json
{
  "email": {
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 465,
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    },
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "user": "your-email@gmail.com",
      "pass": "your-app-password"
    }
  }
}
```

> Gmail 用户需要开启 IMAP 并生成[应用专用密码](https://support.google.com/accounts/answer/185833)。

### 7. 设置 API Key

```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
```

建议加入 `~/.zshrc` 持久化。

### 8. 部署守护进程（可选）

```bash
# 启动后台服务（定时任务 + 邮件监听）
my-assistant daemon start

# 查看状态
my-assistant daemon status

# 停止
my-assistant daemon stop
```

---

## 使用方法

### 首次启动

```bash
my-assistant chat
```

首次启动会触发引导流程：

```
╔══════════════════════════════════╗
║         My-Assistant            ║
║   基于 pi-agent 的个人 AI 管家    ║
╚══════════════════════════════════╝

小一 > 你好！这是我们第一次见面。在开始之前，我想先认识你：
① 你希望怎么称呼我？（给我起个名字）
② 你希望我有什么性格特点？
   比如：幽默风趣、严谨专业、简洁高效、温柔体贴...

你 > 叫大白，性格幽默风趣一点
```

之后每次启动直接进入聊天，不再重复引导。

### 日常使用

```bash
# 交互式聊天
my-assistant chat
# 然后输入任何指令：
#   你 > 帮我整理桌面文件
#   你 > 查看我的收件箱
#   你 > 每天早上8点提醒我站会
#   你 > 写一个脚本备份 ~/Documents 到 ~/Backup
#   你 > exit  # 退出
```

```bash
# 管理记忆
my-assistant memory list              # 列出所有记忆
my-assistant memory search 咖啡       # 搜索记忆
my-assistant memory stats             # 记忆统计
```

```bash
# 管理定时任务
my-assistant tasks list               # 列出定时任务
my-assistant tasks log                # 查看执行日志
```

```bash
# 管理自动生成的 Skills
my-assistant skills list              # 列出 Skills
my-assistant skills delete <name>     # 删除 Skill
```

```bash
# 管理配置
my-assistant config show              # 查看配置
my-assistant config edit              # 编辑配置（打开编辑器）
my-assistant config reset             # 重置引导流程
```

### 作为 pi-agent 扩展使用

```bash
# 安装扩展
pi install /path/to/my-assistant-baseOnpi

# 验证
pi list  # 应显示 my-assistant-baseOnpi

# 在 pi 中使用
pi
# agent 自动获得 my-assistant 的工具和命令
```

---

## 项目结构

```
my-assistant-baseOnpi/
├── package.json                    # monorepo root
├── tsconfig.json                   # TS project references
├── tsconfig.base.json              # 共享 TS 配置
├── .gitignore
├── README.md
├── .pi/
│   ├── extensions/
│   │   └── my-assistant.ts         # pi-agent 扩展
│   └── skills/                     # 自动生成的 Skills
│       └── .gitkeep
├── packages/
│   ├── core/
│   │   ├── package.json            # @my-assistant/core
│   │   ├── tsconfig.json
│   │   ├── data/.gitkeep
│   │   └── src/
│   │       ├── index.ts            # createAssistantAgent() 入口
│   │       ├── config.ts           # ConfigManager
│   │       ├── soul.ts             # System Prompt 构建器
│   │       ├── tools/
│   │       │   ├── index.ts        # createAllTools()
│   │       │   ├── email-tools.ts  # send_email, check_inbox
│   │       │   ├── cron-tools.ts   # schedule/list/delete_task
│   │       │   ├── bash-tools.ts   # run_script
│   │       │   └── plan-tool.ts    # plan_task
│   │       ├── memory/
│   │       │   ├── index.ts        # MemoryEngine
│   │       │   ├── storage.ts      # JSON 读写/搜索
│   │       │   └── compaction.ts   # 记忆压缩
│   │       ├── skills/
│   │       │   ├── index.ts        # SkillGenerator
│   │       │   └── topic-tracker.ts # TopicTracker
│   │       └── hooks/
│   │           ├── index.ts        # createAllHooks()
│   │           ├── memory-hooks.ts # 记忆提取钩子
│   │           └── skill-hooks.ts  # Skill 检测钩子
│   ├── cli/
│   │   ├── package.json            # @my-assistant/cli
│   │   ├── tsconfig.json
│   │   ├── bin/
│   │   │   └── my-assistant        # 全局可执行脚本
│   │   └── src/
│   │       ├── index.ts            # CLI 入口 (main)
│   │       ├── commands.ts         # 16 个子命令路由
│   │       └── tui.ts              # TUI 聊天界面
│   └── daemon/
│       ├── package.json            # @my-assistant/daemon
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # 守护进程主入口
│           ├── scheduler.ts        # node-cron 定时调度
│           ├── mail-watcher.ts     # IMAP 邮件监听
│           └── agent-runner.ts     # 无头 Agent 执行器
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-07-07-my-assistant-design.md
        └── plans/
            └── 2026-07-07-my-assistant-implementation.md
```

---

## 配置参考

`~/.my-assistant/config.json`：

```json
{
  "assistant": {
    "name": "小一",
    "personality": "温和、细心、善于记住用户的偏好和习惯，回复简洁有力，用中文",
    "customized": false
  },
  "email": {
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 465,
      "user": "",
      "pass": ""
    },
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "user": "",
      "pass": ""
    }
  },
  "model": {
    "default": "deepseek-v4-pro",
    "cheap": "deepseek-v4-flash"
  }
}
```

---

## 开发

```bash
# 安装依赖
npm install --ignore-scripts

# 构建全部包
npm run build

# 单独构建
npm run build -w @my-assistant/core
npm run build -w @my-assistant/cli
npm run build -w @my-assistant/daemon

# 清理
npm run clean
```

---

## License

MIT
