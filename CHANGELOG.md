# Changelog

## 0.5.0

- 新增 `card_answer`：给问题卡追加补答（只追加、不覆盖，日期自动 `YYYY-MM-DD：`）
- 新增 `card_void`：作废 / 恢复（`voidedAt` 标记，不删 jsonl 行）
- `ENV_PROMPT.md` 两行里提及新工具（121 → 174 字）

## 0.4.0

- 作废卡片：`voidedAt` 标记、页面两段式确认、「看作废的」开关、`card_book` 跳过并在摘要报数
- `card_list` / `card_search` 默认跳过作废卡（可选 `includeVoided`）

## 0.3.0

- 问题卡补答：`answers` 字段、页面补答输入框、`card_book` 里答案缩进排在问题下面
- `card_list` / `card_search` 行尾标「解了 N 条」，答案正文缩进列出

## 0.2.0

- World 页面（WebUI）：写卡表单、搜索、最近列表（`dist/webui.js` / `dist/webui.css`）

## 0.1.0

- 初版：`card_add` / `card_list` / `card_search` / `card_book`；jsonl 数据、两行 envPrompt
