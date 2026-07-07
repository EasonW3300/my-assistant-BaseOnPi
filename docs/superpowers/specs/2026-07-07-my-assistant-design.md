# My-Assistant: 基于 Pi-Agent 的个人 AI 管家 — 设计规格书

**日期**: 2026-07-07  
**状态**: 设计完成，待实现  
**仓库**: https://github.com/EasonW3300/my-assistant-BaseOnPi.git

---

## 概述

基于 pi-agent SDK 构建的个人 AI 管家，具备灵魂设定、读写文件、收发邮件、定时任务、脚本执行、记忆管理、技能自动生成等能力。采用 Hybrid 混合架构：核心 Agent 逻辑作为可复用模块，外层包装 CLI 交互模式和后台守护进程模式。

---

## 第一节：项目结构与模块划分

```
my-assistant-baseOnpi/
├── package.json                    # monorepo root (npm workspaces)
├── tsconfig.json
├── .pi/                            # pi-agent 扩展目录
│   ├── extensions/
│   │   └── my-assistant.ts         # pi 扩展入口：注册全部工具+技能
│   └── skills/                     # 自动生成的 Skills 存放处
│       └── .gitkeep
├── packages/
│   ├── core/                       # 核心模块：工具+记忆+技能引擎
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts            # 导出 createAssistantAgent()
│   │   │   ├── soul.ts             # 系统提示词（管家灵魂）
│   │   │   ├── tools/              # 自定义工具集
│   │   │   │   ├── index.ts        # 工具注册入口
│   │   │   │   ├── file-tools.ts   # 读写文件
│   │   │   │   ├── email-tools.ts  # 收发邮件 (send_email/check_inbox)
│   │   │   │   ├── cron-tools.ts   # 定时任务 (schedule/list/delete)
│   │   │   │   └── bash-tools.ts   # 脚本执行 (run_script)
│   │   │   ├── memory/             # 记忆引擎
│   │   │   │   ├── index.ts        # MemoryEngine 类
│   │   │   │   ├── storage.ts      # JSON 文件读写
│   │   │   │   └── compaction.ts   # 记忆自动压缩
│   │   │   ├── skills/             # 技能自动生成引擎
│   │   │   │   ├── index.ts        # SkillGenerator 类
│   │   │   │   └── topic-tracker.ts # 话题重复检测器（3次触发）
│   │   │   └── hooks/              # Agent 生命周期钩子
│   │   │       ├── index.ts
│   │   │       ├── memory-hooks.ts  # 对话后自动提取/更新记忆
│   │   │       └── skill-hooks.ts   # 检测重复话题→生成 Skill
│   │   └── data/                   # 运行时数据目录
│   │       ├── memory.json         # 记忆库存储
│   │       └── topic-stats.json    # 话题重复计数
│   ├── cli/                        # CLI 交互模式
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts            # 入口，解析参数
│   │   │   ├── commands.ts         # 子命令路由
│   │   │   └── tui.ts              # 基于 pi-tui 的聊天界面
│   │   └── bin/
│   │       └── my-assistant        # 可执行脚本
│   └── daemon/                     # 后台常驻服务
│       ├── package.json
│       └── src/
│           ├── index.ts            # 守护进程入口
│           ├── scheduler.ts        # 定时任务调度器（node-cron）
│           ├── mail-watcher.ts     # IMAP 邮件监听
│           └── agent-runner.ts     # 无头 agent 会话执行器
└── README.md
```

### 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 包管理 | npm workspaces | 与 pi monorepo 一致，core/cli/daemon 互相引用 |
| 记忆存储 | 单个 JSON 文件 | 简单可靠，后续可迁移到 SQLite |
| 定时任务 | node-cron + daemon 进程 | 轻量，无需外部 crontab 配置 |
| 邮件监听 | IMAP IDLE | 实时接收，不需要轮询 |
| CLI 界面 | 复用 pi-tui + 自定义组件 | 不造轮子，pi 的 TUI 已经很成熟 |
| 配置存储 | ~/.my-assistant/config.json | 与 pi 的 ~/.pi 并存，互不干扰 |

---

## 第二节：灵魂设定与核心工具

### 一、System Prompt 模板

```
你是「{config.name}」，用户的个人 AI 管家。

## 性格
{config.personality}

## 核心能力
- 读写文件：帮用户整理文档、笔记、数据
- 收发邮件：查看收件箱、发送邮件
- 定时任务：设置提醒、定时执行操作
- 脚本执行：遇到无法用现有工具完成的任务，编写脚本通过 bash 执行
- 记忆管理：自动记住用户偏好和重要信息
- 技能学习：当同类任务重复出现，自动沉淀为 Skill

## 记忆系统
你有持久化记忆，存储在本地记忆库中。
每次对话后自动提取关键信息更新记忆。
记忆分为三类：
1. 偏好记忆：用户喜欢什么、不喜欢什么
2. 事实记忆：用户告诉你的重要信息（生日、地址、社交关系等）
3. 任务记忆：用户交代的待办事项和承诺

## 行为准则
- 遇到复杂任务时，先规划再执行（列出步骤，逐条完成）
- 文件操作前先确认路径，避免误删
- 发送邮件前先让用户确认内容
- 定时任务设置后主动告知下次触发时间
```

默认值：名字 "小一"，性格 "温和、细心、善于记住用户的偏好和习惯，回复简洁有力，用中文"。

### 二、工具集

| 工具名 | 功能 | 实现方式 |
|--------|------|---------|
| read_file | 读取文件内容 | pi 内置 |
| write_file | 创建/覆盖文件 | pi 内置 |
| grep_files | 搜索文件内容 | pi 内置 |
| find_files | 按名称查找文件 | pi 内置 |
| list_dir | 列出目录内容 | pi 内置 |
| send_email | 发送邮件 | nodemailer + SMTP |
| check_inbox | 查收最新邮件 | imap-simple |
| schedule_task | 创建定时任务 | 写入 tasks.json |
| list_tasks | 列出所有定时任务 | 读取 tasks.json |
| delete_task | 删除定时任务 | 修改 tasks.json |
| run_script | 执行 bash 脚本 | child_process.exec |
| remember | 搜索/添加记忆 | memory.json |
| search_memory | 关键词搜索记忆 | memory.json |
| plan_task | 复杂任务自动拆解 | LLM 调用 |

---

## 第三节：灵魂初始化流程

### 配置存储

`~/.my-assistant/config.json`：
```json
{
  "assistant": {
    "name": "小一",
    "personality": "温和、细心、善于记住用户的偏好和习惯，回复简洁有力，用中文",
    "customized": false
  },
  "email": {
    "smtp": { "host": "", "port": 465, "user": "", "pass": "" },
    "imap": { "host": "", "port": 993, "user": "", "pass": "" }
  },
  "model": {
    "default": "deepseek-v4-pro",
    "cheap": "deepseek-v4-flash"
  }
}
```

### 首次启动流程

1. 读取 config.json
2. 检查 `config.assistant.customized` 字段
3. 若 `false`（首次）：代码层向会话注入引导消息：
   > "你好！这是我们第一次见面。在开始之前，我想先认识你：① 你希望怎么称呼我？（名字）② 你希望我有什么性格特点？比如：幽默风趣、严谨专业、简洁高效、温柔体贴..."
4. 用户回答 → agent 提取 {名字, 性格} → write_file 写入 config.json → `customized = true`
5. 若 `true`（已初始化）：直接加载用户设定的名字和性格，正常启动

### 关键原则

- System Prompt 始终从 config 读取变量，**不包含**"如果首次运行"的条件分支
- 判断逻辑完全在代码层（config.customized 字段），关闭会话重新打开不会重复触发

---

## 第四节：记忆引擎

### 生命周期

- **对话中**：agent 使用 remember 工具搜索记忆辅助回答
- **对话后**：turn_end hook 触发 → LLM 提取关键信息 → 去重 → 写入 memory.json
- **定期维护**：daemon 触发记忆压缩，旧记忆聚合为摘要

### 数据结构

`data/memory.json`：
```json
{
  "version": 1,
  "entries": [
    {
      "id": "mem-001",
      "type": "preference",
      "content": "用户喜欢喝浅烘耶加雪菲咖啡，自己手冲，用 V60 滤杯",
      "keywords": ["咖啡", "手冲", "耶加雪菲"],
      "source": "2026-07-07 对话",
      "createdAt": "2026-07-07T10:30:00Z",
      "updatedAt": "2026-07-07T10:30:00Z",
      "accessCount": 3
    }
  ],
  "summaries": [
    {
      "id": "summary-001",
      "period": "2026-01 至 2026-06",
      "content": "用户是咖啡爱好者...",
      "sourceCount": 15,
      "createdAt": "2026-07-01T00:00:00Z"
    }
  ]
}
```

记忆类型：preference（偏好）、fact（事实）、task（待办任务）

### 自动提取流程（turn_end hook）

1. 获取本轮对话内容
2. 用便宜模型（deepseek-v4-flash）提取关键信息，返回 `[{type, content, keywords}]`
3. 关键词相似度去重（>0.7 → 合并更新，否则新增）
4. task 类型自动检测截止日期

### 检索

关键词精确匹配 keywords 字段 + 内容模糊匹配，按 accessCount 降序 + 时间降序排序，返回 top 10。

---

## 第五节：技能自动生成引擎

### 触发机制

同一话题/任务被提及 ≥ 3 次 → 自动调用 LLM 生成 SKILL.md → 保存到 `.pi/skills/` → agent 后续自动使用。

### 话题重复检测

`data/topic-stats.json`：
```json
{
  "topics": {
    "整理桌面文件": {
      "count": 3,
      "firstSeen": "2026-07-01",
      "lastSeen": "2026-07-07",
      "category": "file-organization",
      "skillGenerated": false
    }
  }
}
```

### 检测流程（turn_end hook）

1. 用便宜模型分析本轮对话 → 提取 topic + category
2. 相似度匹配（>0.7）→ count++，否则新建
3. count >= 3 且 skillGenerated == false → 触发 Skill 生成

### Skill 生成流程

1. 收集该话题所有历史对话片段
2. 调用 LLM 生成 SKILL.md（含 name、description、触发条件、执行步骤、注意事项）
3. 保存到 `.pi/skills/{slug}/SKILL.md`
4. 通知用户 Skill 已生成

---

## 第六节：后台守护进程

### 架构

三个子模块：
- **TaskScheduler**：node-cron 内存调度，从 tasks.json 加载任务，到点创建无头 Agent 会话执行
- **MailWatcher**：IMAP IDLE 长连接监听新邮件 → 便宜模型判断重要性（1-5分）→ ≥4分主动通知
- **AgentRunner**：CLI 和 Daemon 共用的无头 Agent 执行器，调用 createAssistantAgent() 创建会话

### 进程管理

pid 文件防重启动，SIGTERM/SIGINT 优雅退出（停止调度器 + 断开 IMAP + 删除 pid 文件）。

---

## 第七节：双层压缩策略

### 第一层：会话压缩（pi 内置 compact）

- 触发：上下文 > 100K tokens
- 处理：LLM 总结旧对话回合 → 替换为摘要
- 存储：session JSONL 文件
- 配置：reserveTokens: 20000, keepRecentTokens: 30000

### 第二层：记忆压缩（自定义）

- 触发：记忆条目 > 100 条 或 超过 30 天未整理
- 处理：选择 >30天且 accessCount < 3 的条目，按类型分组，LLM 聚合为摘要
- 存储：entries 删除原条目，summaries 追加摘要

### 压缩总览

| 层级 | 触发条件 | 频率 | 压缩比 |
|------|---------|------|--------|
| 会话层 | 上下文 > 100K tokens | 对话中实时 | ~5:1 |
| 记忆层 | 条目 > 100 或 30天 | 对话后静默 | ~10:1 |

---

## 第八节：CLI 命令接口

```
my-assistant
├── chat                  # 启动交互式聊天（默认子命令）
├── daemon start          # 启动后台守护进程
├── daemon stop           # 停止守护进程
├── daemon status         # 查看守护进程状态
├── memory list           # 列出所有记忆
├── memory search <关键词> # 搜索记忆
├── memory stats          # 记忆统计
├── tasks list            # 列出定时任务
├── tasks add             # 交互式添加定时任务
├── tasks delete <id>     # 删除定时任务
├── tasks log             # 查看执行日志
├── skills list           # 列出自动生成的 Skills
├── skills delete <name>  # 删除某个 Skill
├── config show           # 查看当前配置
├── config edit           # 编辑器打开 config.json
├── config reset          # 重置初始化
└── update                # 更新 my-assistant 自身
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| Agent 运行时 | @earendil-works/pi-agent-core |
| LLM 统一 API | @earendil-works/pi-ai |
| TUI 界面 | @earendil-works/pi-tui |
| 默认模型 | DeepSeek V4 Pro (deepseek-v4-pro) |
| 邮件发送 | nodemailer |
| 邮件接收 | imap-simple |
| 定时任务 | node-cron |
| 运行时 | Node.js >= 22.19.0, TypeScript |
