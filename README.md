# 读书小卡 · cortico-world-reading-cards

把一起读过、讲过的东西，一句一句存成小卡，按出处归拢成一本能翻的。
纯文件、不联网、不调模型、不引数据库。

一个 [Cortico](https://github.com/Pal-AI-Lab/Cortico) World 扩展（`cortico.kind = world`，api 6）。

## 功能

| 工具 | 干什么 |
|---|---|
| `card_add` | 存一张卡：正文 / 出处 / kind（`quote` 原话、`idea` 想通的、`question` 问号）/ by（他、我、书）/ 日期 / 标签 |
| `card_list` | 按出处或类型翻卡，分页；问题卡在卡片行下列出补答 |
| `card_search` | 关键词子串检索（正文、出处、标签等） |
| `card_book` | 按出处归拢，装订成一本 markdown |
| `card_answer` | 给问题卡追加一条补答（只追加、不覆盖，日期自动补 `YYYY-MM-DD：`） |
| `card_void` | 作废 / 恢复一张卡（写 `voidedAt` 标记，不删行；`undo: true` 恢复） |

页面（控制台 → Worlds → 读书小卡 → 「翻卡」）：写卡表单、搜索、最近列表、问题卡补答、作废 / 恢复、看作废的开关。

## 数据

`<部署目录>/worlds/reading-cards/data/cards.jsonl`，一行一张卡，纯 UTF-8 JSON：

```json
{"id":"c0001","at":"2026-11-08","source":"线代·第二课","kind":"idea","by":"他","text":"差分对应求导，求和对应积分","tags":["线代"]}
```

- `answers`：问题卡的补答，字符串数组，每条形如 `YYYY-MM-DD：正文`。
- `voidedAt`：作废标记（`YYYY-MM-DD`）。只是标记，不删行；可恢复（清掉该字段）。
- 装订产物：`<部署目录>/worlds/reading-cards/data/书.md`。

## 设计约定

- **不删卡、不改原话**：正文和出处永远不动；记错了就再存一张改正的。
- **作废不真删**：只写 `voidedAt`；`card_list` / `card_search` / `card_book` 默认跳过作废的卡，`card_list` / `card_search` 可传 `includeVoided`。
- **前缀只有两行**（`ENV_PROMPT.md`），无占位变量。

## 安装

作为 Cortico 的 World 扩展，放进部署的扩展目录即可：

1. 把本仓库放到 `<部署>/vendor/cortico-world-reading-cards`；
2. 在 `<部署>/extensions/package.json` 的 `dependencies` 里加一行：
   `"cortico-world-reading-cards": "link:../vendor/cortico-world-reading-cards"`；
3. 把 `<部署>/extensions/node_modules/cortico-world-reading-cards` 指向该目录（junction / symlink）；
4. 重启 Cortico 进程，在控制台 Worlds 里启用「读书小卡」。

## 本地自测

```sh
node tools/selftest.mjs
```

## License

MIT
