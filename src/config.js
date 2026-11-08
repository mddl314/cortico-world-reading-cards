/**
 * 读书小卡的路径约定。
 *
 * 数据都在这一个 World 自己的目录里：`<部署目录>/worlds/reading-cards/`
 *   data/cards.jsonl  一行一张卡（纯 UTF-8 JSON，记事本可开）
 *   data/书.md        card_book 导出的 markdown
 *
 * 部署的 config.json 里只有 `worlds.reading-cards.enabled` 用来挂载这个 World，
 * 没有别的参数要配。
 */
import { join } from 'node:path';

export const READING_CARDS_ID = 'reading-cards';
export const CARDS_FILE = 'cards.jsonl';
export const BOOK_FILE = '书.md';

/** `<部署目录>/worlds/reading-cards`。 */
export function worldDataDir(botDir) {
  return join(botDir, 'worlds', READING_CARDS_ID);
}

/** 卡片本体：`<部署目录>/worlds/reading-cards/data/cards.jsonl`。 */
export function cardsPathOf(botDir) {
  return join(worldDataDir(botDir), 'data', CARDS_FILE);
}

/** card_book 的产出：`<部署目录>/worlds/reading-cards/data/书.md`。 */
export function bookPathOf(botDir) {
  return join(worldDataDir(botDir), 'data', BOOK_FILE);
}
