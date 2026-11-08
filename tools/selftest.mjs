/**
 * 读书小卡本地自测：不联网、不调模型，在临时目录里把四个工具跑一遍。
 * 输出就是回执里贴的那四条：加三张卡 → list → search → book。
 *
 *   node tools/selftest.mjs
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { READING_CARDS } from '../src/index.js';
import { bookPathOf, cardsPathOf } from '../src/config.js';
import { ReadingCardsWorld } from '../src/world.js';

const host = { log: { trace() {}, debug() {}, info() {}, warn() {}, error() {} } };
const botDir = mkdtempSync(join(tmpdir(), 'reading-cards-'));
const world = new ReadingCardsWorld({ botDir, timezone: 'Asia/Shanghai' });

const tool = (name) => {
  const found = world.tools().find((item) => item.name === name);
  if (!found) throw new Error(`没有工具 ${name}`);
  return found;
};
const call = (name, args) => tool(name).handler(args);

try {
  await world.start(host);
  console.log('===== 0 · 定义 =====');
  console.log(`id: ${READING_CARDS.id} / label: ${READING_CARDS.label}`);
  console.log(`tools: ${world.tools().map((item) => item.name).join(', ')}`);
  console.log(`envPromptVars: ${JSON.stringify(await world.envPromptVars())}`);
  console.log(`数据文件: ${cardsPathOf(botDir)}`);

  console.log('\n===== ① card_add ×3 =====');
  for (const card of [
    {
      text: '商品交换使商品彼此作为价值发生关系并作为价值来实现',
      source: '资本论·第一章第二节',
      kind: 'quote', by: '书', at: '2026-10-21', tags: ['资本论', '价值'],
    },
    {
      text: '差分对应求导，求和对应积分',
      source: '线代·第二课',
      kind: 'idea', by: '他', at: '2026-11-08', tags: ['线代'],
    },
    {
      text: '拜物教到底只是意识，还是交换关系本身长出来的？',
      source: '资本论·第一章第四节',
      kind: 'question', by: '我', at: '2026-10-29', tags: ['资本论', '拜物教'],
    },
  ]) console.log(await call('card_add', card));

  console.log('\n===== ② card_list =====');
  console.log(await call('card_list', { offset: 0, limit: 20 }));

  console.log('\n===== ③ card_search（q=资本论）=====');
  console.log(await call('card_search', { q: '资本论' }));

  console.log('\n===== ④ card_book =====');
  console.log(await call('card_book'));
  console.log('--- 书.md 实际内容 ---');
  console.log(readFileSync(bookPathOf(botDir), 'utf8'));

  console.log('\n===== ⑤ 作废 / 恢复 =====');
  const cardsPath = cardsPathOf(botDir);
  const lineOf = (raw, id) => raw.split('\n').filter((line) => line.trim()).find((line) => JSON.parse(line).id === id);
  const rawBefore = readFileSync(cardsPath, 'utf8');
  const linesBefore = rawBefore.split('\n').filter((line) => line.trim()).length;
  const beforeCard = JSON.parse(lineOf(rawBefore, 'c0002'));
  const beforeFields = JSON.stringify({ text: beforeCard.text, source: beforeCard.source, answers: beforeCard.answers ?? null });

  const ui = world.webUi('zh');
  const voided = await ui.invoke('cards', 'void', ['c0002']);
  const rawAfterVoid = readFileSync(cardsPath, 'utf8');
  const linesAfterVoid = rawAfterVoid.split('\n').filter((line) => line.trim()).length;
  const afterCard = JSON.parse(lineOf(rawAfterVoid, 'c0002'));
  const afterFields = JSON.stringify({ text: afterCard.text, source: afterCard.source, answers: afterCard.answers ?? null });
  console.log(`作废返回 voidedAt: ${JSON.stringify(voided.card.voidedAt)}`);
  console.log(`jsonl 行数: ${linesBefore} → ${linesAfterVoid}（不删行: ${linesBefore === linesAfterVoid}）`);
  console.log(`正文/出处/answers 逐字节相同: ${beforeFields === afterFields}`);
  const listAfterVoid = await call('card_list', {});
  const listWithVoided = await call('card_list', { includeVoided: true });
  const searchAfterVoid = await call('card_search', { q: '差分' });
  console.log(`card_list 默认不含它: ${!listAfterVoid.includes('c0002')}；includeVoided 能看见: ${listWithVoided.includes('c0002')}`);
  console.log(`card_search 不含它: ${!searchAfterVoid.includes('c0002')}`);
  console.log('card_book:', (await call('card_book')).replace(/\n/g, ' | '));
  const bookAfterVoid = readFileSync(bookPathOf(botDir), 'utf8');
  console.log(`书.md 不含作废卡: ${!bookAfterVoid.includes('差分对应求导')}；摘要含「1 张作废」: ${bookAfterVoid.includes('1 张作废')}`);

  await ui.invoke('cards', 'restore', ['c0002']);
  const rawAfterRestore = readFileSync(cardsPath, 'utf8');
  const linesAfterRestore = rawAfterRestore.split('\n').filter((line) => line.trim()).length;
  const restoredCard = JSON.parse(lineOf(rawAfterRestore, 'c0002'));
  const restoredFields = JSON.stringify({ text: restoredCard.text, source: restoredCard.source, answers: restoredCard.answers ?? null });
  const listRestored = await call('card_list', {});
  const searchRestored = await call('card_search', { q: '差分' });
  await call('card_book');
  const bookRestored = readFileSync(bookPathOf(botDir), 'utf8');
  console.log(`恢复后 list 含它: ${listRestored.includes('c0002')}；search 含它: ${searchRestored.includes('c0002')}`);
  console.log(`恢复后 书.md 含它: ${bookRestored.includes('差分对应求导')}`);
  console.log(`恢复后 voidedAt 已清: ${!('voidedAt' in restoredCard)}；字段仍逐字节相同: ${restoredFields === beforeFields}`);
  console.log(`行数最终: ${linesAfterRestore}（= ${linesBefore}: ${linesAfterRestore === linesBefore}）`);

  console.log('===== ⑥ 前缀字数（envPrompt 渲染后，trim）=====');
  const env = readFileSync(new URL('../ENV_PROMPT.md', import.meta.url), 'utf8').trim();
  console.log(`行数=${env.split('\n').length} 字符数=${[...env].length} UTF-16长度=${env.length} 字节=${Buffer.byteLength(env, 'utf8')}`);

  console.log('\n===== ⑦ 补答在工具回执里看得见 =====');
  await world.webUi('zh').invoke('cards', 'answer', ['c0003', '这是补写进去的答案正文']);
  const listWithAnswers = await call('card_list', {});
  const searchWithAnswers = await call('card_search', { q: '拜物教' });
  console.log('card_list 相关问题卡片段:\n' + listWithAnswers.split('\n').filter((line) => line.includes('c0003') || line.includes('答案：')).join('\n'));
  console.log(`card_list 含答案正文: ${listWithAnswers.includes('这是补写进去的答案正文')}`);
  console.log(`card_search 含答案正文: ${searchWithAnswers.includes('这是补写进去的答案正文')}`);
  console.log(`答案行带日期: ${listWithAnswers.split('\n').some((line) => line.includes('答案：') && /\d{4}-\d{2}-\d{2}/.test(line))}`);

  console.log('\n===== ⑧ 新工具 card_answer / card_void =====');
  console.log('工具表: ' + world.tools().map((item) => item.name).join(', '));
  console.log('card_answer:', (await call('card_answer', { id: 'c0003', text: '工具补的答案' })).split('\n')[0]);
  console.log('非问题卡拒绝:', await call('card_answer', { id: 'c0002', text: '不该能补' }));
  console.log('card_void:', (await call('card_void', { id: 'c0002' })).split('\n')[0]);
  console.log('作废后 card_list 含 c0002:', (await call('card_list', {})).includes('c0002'));
  console.log('includeVoided 含 c0002:', (await call('card_list', { includeVoided: true })).includes('c0002'));
  console.log('card_void undo:', (await call('card_void', { id: 'c0002', undo: true })).split('\n')[0]);
  console.log('恢复后 card_list 含 c0002:', (await call('card_list', {})).includes('c0002'));
} finally {
  rmSync(botDir, { recursive: true, force: true });
}
