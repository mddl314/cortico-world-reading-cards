/**
 * 卡片的读写与检索。
 *
 * 数据只有一份 jsonl：一行一张卡。读的时候坏行直接跳过——不让一行坏数据把整本读不出来——
 * 但把跳过的行数带回去，回执里会说。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { bookPathOf, cardsPathOf } from './config.js';

/** 读全部卡；返回 { cards, path, skipped }。文件不存在就是空本（不是错误）。 */
export function readCards(botDir) {
  const path = cardsPathOf(botDir);
  if (!existsSync(path)) return { cards: [], path, skipped: 0 };
  const raw = readFileSync(path, 'utf8');
  const cards = [];
  let skipped = 0;
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    try {
      const card = JSON.parse(text);
      if (card && typeof card === 'object' && typeof card.text === 'string') cards.push(card);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { cards, path, skipped };
}

/** 下一张卡的 id：现有最大编号 + 1，四位补零（c0001 起）。 */
export function nextCardId(cards) {
  let max = 0;
  for (const card of cards) {
    const match = /^c(\d+)$/.exec(String(card?.id ?? ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `c${String(max + 1).padStart(4, '0')}`;
}

/** 追加一张卡（不重写整个文件，坏一行不会毁掉前面所有行）。 */
export function appendCard(botDir, card) {
  const path = cardsPathOf(botDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(card)}\n`, 'utf8');
  return path;
}

/** 关键词子串检索：text / source / by / kind / tags 任意命中即可，不区分大小写。 */
export function searchCards(cards, q, { source, kind } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  if (!needle) return [];
  return cards.filter((card) => {
    if (source && String(card.source ?? '') !== source) return false;
    if (kind && String(card.kind ?? '') !== kind) return false;
    const haystack = [
      String(card.text ?? ''),
      String(card.source ?? ''),
      String(card.by ?? ''),
      String(card.kind ?? ''),
      ...(Array.isArray(card.tags) ? card.tags.map(String) : []),
    ].join('\n').toLowerCase();
    return haystack.includes(needle);
  });
}

/** 按出处归拢；保持卡片首次出现的顺序（读到哪里就记到哪里）。 */
export function groupBySource(cards) {
  const groups = new Map();
  for (const card of cards) {
    const source = String(card.source ?? '').trim() || '未注明出处';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(card);
  }
  return groups;
}

/** 一张问题卡已有的补答；不是数组就当没有。 */
export function answersOf(card) {
  return Array.isArray(card?.answers) ? card.answers.filter((item) => typeof item === 'string' && item.trim()) : [];
}

/** 补答的一行写法：`YYYY-MM-DD：正文`。答案只往后加，不改正文和出处。 */
export function formatAnswer(text, at) {
  const date = String(at ?? '').trim();
  const body = String(text ?? '').trim();
  return date ? `${date}：${body}` : body;
}

/** 卡是否已作废；`voidedAt` 是 `YYYY-MM-DD`。 */
export function isVoided(card) {
  return typeof card?.voidedAt === 'string' && card.voidedAt.trim() !== '';
}

/**
 * 读-改-写一张卡：逐行解析整份 jsonl，只改命中 id 的那一张，其他字段原样保留；
 * 临时文件 + rename 落盘，不删行（行数不变）。返回 { card } 或 { error }。
 */
function updateCard(botDir, id, mutate) {
  const path = cardsPathOf(botDir);
  if (!existsSync(path)) return { error: '卡本还是空的。' };
  const raw = readFileSync(path, 'utf8');
  const cards = [];
  let found = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let card;
    try {
      card = JSON.parse(trimmed);
    } catch {
      return { error: '卡本里有读不出来的行，先别动它。' };
    }
    if (String(card?.id ?? '') === String(id)) found = card;
    cards.push(card);
  }
  if (!found) return { error: `没有 ${id} 这张卡。` };
  const outcome = mutate(found);
  if (outcome && outcome.error) return { error: outcome.error };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, cards.map((card) => JSON.stringify(card)).join('\n') + '\n', 'utf8');
  renameSync(tmp, path);
  return { card: found };
}

/** 往一张卡追一条补答；只加答案，不改正文和出处。 */
export function appendAnswer(botDir, id, text, at) {
  const body = String(text ?? '').trim();
  if (!body) return { error: '没补上：答案是空的。' };
  return updateCard(botDir, id, (card) => {
    if (String(card.kind ?? '') !== 'question') return { error: `没补上：${id} 不是问题卡（kind=${card.kind}），只有问题卡能补答。` };
    if (!Array.isArray(card.answers)) card.answers = [];
    card.answers.push(formatAnswer(body, at));
    return null;
  });
}

/** 作废一张卡：只写 voidedAt，正文/出处/answers 一字不动，不删行。 */
export function voidCard(botDir, id, at) {
  const date = String(at ?? '').trim();
  if (!date) return { error: '没作废：缺少日期。' };
  return updateCard(botDir, id, (card) => {
    if (isVoided(card)) return { error: `没作废：${id} 已经作废过了（${card.voidedAt}）。` };
    card.voidedAt = date;
    return null;
  });
}

/** 恢复一张卡：把 voidedAt 清掉，其他字段一个不碰。 */
export function restoreCard(botDir, id) {
  return updateCard(botDir, id, (card) => {
    if (!isVoided(card)) return { error: `没恢复：${id} 本来就没作废。` };
    delete card.voidedAt;
    return null;
  });
}

/** 把卡片拼成一本 markdown。作废的卡不装订，只在摘要里报数。 */
export function renderBook(cards) {
  const live = cards.filter((card) => !isVoided(card));
  const voided = cards.length - live.length;
  const groups = groupBySource(live);
  const solved = live.filter((card) => String(card?.kind ?? '') === 'question' && answersOf(card).length > 0).length;
  const lines = ['# 读书小卡', ''];
  const summary = [`共 ${live.length} 张`, `${groups.size} 处出处`];
  if (solved > 0) summary.splice(1, 0, `${solved} 张问题已解`);
  if (voided > 0) summary.push(`${voided} 张作废`);
  lines.push(`> 按出处归拢，${summary.join('，')}。`, '');
  for (const [source, group] of groups) {
    lines.push(`## ${source}`, '');
    for (const card of group) {
      const kind = String(card.kind ?? 'idea');
      const by = String(card.by ?? '');
      const at = String(card.at ?? '');
      const tail = [by, at].filter(Boolean).join('，');
      lines.push(`- **[${kind}]** ${String(card.text ?? '')}${tail ? `（${tail}）` : ''}`);
      // 补答作为缩进的一行放在问题下面；正文和出处永远不动。
      for (const answer of answersOf(card)) lines.push(`  - 答案：${answer}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** 写书到 data/书.md；返回路径、装订条数与跳过的作废数。 */
export function writeBook(botDir, cards) {
  const path = bookPathOf(botDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderBook(cards), 'utf8');
  const live = cards.filter((card) => !isVoided(card));
  return { path, count: live.length, sources: groupBySource(live).size, voided: cards.length - live.length };
}
