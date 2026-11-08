/**
 * 读书小卡的 World 实例。
 *
 * 四件事：存一张（card_add）、按出处/类型翻（card_list）、关键词找（card_search）、
 * 按出处归拢成一本 markdown（card_book）。没有删除工具——记错了就再存一张改正的，
 * 只留对的等于把自己洗成没走错过路的样子。
 *
 * 数据只有一份：`<部署目录>/worlds/reading-cards/data/cards.jsonl`，一行一张卡。
 */
import { fileURLToPath } from 'node:url';
import { READING_CARDS_ID, cardsPathOf } from './config.js';
import { appendAnswer, appendCard, groupBySource, isVoided, nextCardId, readCards, restoreCard, searchCards, voidCard, writeBook } from './store.js';

const ENV_PROMPT_FILE = fileURLToPath(new URL('../ENV_PROMPT.md', import.meta.url));

/** kind 三选一；by 三选一。 */
const KINDS = ['quote', 'idea', 'question'];
const BYS = ['他', '我', '书'];
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;
/** 页面上「最近」列多少张。 */
const RECENT_LIMIT = 20;
/** 页面唯一的面板 id；客户端 dist/webui.js 的 panels 键必须与它一致。 */
const PAGE_PANEL_ID = 'cards';

/** 部署时区里的今天，YYYY-MM-DD；拿不到时退回本地日期。 */
function todayOf(timezone) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

/** 一行卡的显示写法。问题卡带补答时，行尾标条数，答案缩进一条一行列在下面（带日期）。 */
function cardLine(card) {
  const source = String(card.source ?? '').trim() || '未注明出处';
  const answers = Array.isArray(card.answers) ? card.answers.filter((item) => typeof item === 'string' && item.trim()) : [];
  const meta = [source, card.by, card.at].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');
  const solved = String(card.kind ?? '') === 'question' && answers.length > 0 ? ` · 解了 ${answers.length} 条` : '';
  const voided = isVoided(card) ? ` · 作废于 ${card.voidedAt}` : '';
  const lines = [`- ${card.id} [${card.kind}] ${card.text}（${meta}）${solved}${voided}`];
  for (const answer of answers) lines.push(`  - 答案：${answer}`);
  return lines.join('\n');
}

export class ReadingCardsWorld {
  /** World 实例契约要求带 id（/api/worlds 按它查找）。 */
  id = READING_CARDS_ID;

  #ctx;
  #host = null;

  constructor(ctx) {
    this.#ctx = ctx;
  }

  async start(host) {
    this.#host = host;
    host?.log?.info?.(`reading-cards: 卡本 ${cardsPathOf(this.#ctx.botDir)}`);
  }

  async stop() {
    this.#host = null;
  }

  /** 存一张卡的唯一实现：工具 card_add 与页面「写一张」共用。返回 { card, path } 或 { error }。 */
  #addCard(input) {
    const text = String(input?.text ?? '').trim();
    if (!text) return { error: '没存：text 是空的。一句原话、一个想通的、一个问号，总得有一个。' };
    const kind = String(input?.kind ?? 'idea').trim();
    if (!KINDS.includes(kind)) return { error: `没存：kind 只能是 ${KINDS.join(' / ')}，收到「${kind}」。` };
    const by = String(input?.by ?? '我').trim();
    if (!BYS.includes(by)) return { error: `没存：by 只能是 ${BYS.join(' / ')}，收到「${by}」。` };
    const source = String(input?.source ?? '').trim();
    const at = String(input?.at ?? '').trim() || todayOf(this.#ctx.timezone);
    const tags = Array.isArray(input?.tags) ? input.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
    const { cards } = readCards(this.#ctx.botDir);
    const card = { id: nextCardId(cards), at, source, kind, by, text, tags };
    // 问题卡带答案槽；别的卡没这个字段（答案只对问题卡有意义）。
    if (kind === 'question') card.answers = [];
    const path = appendCard(this.#ctx.botDir, card);
    return { card, path };
  }

  /** 页面数据面：list（最近）/ search / add / answer / void / restore。语义与四个工具一致。 */
  async #invoke(panel, method, args) {
    if (panel !== PAGE_PANEL_ID) throw new Error(`reading-cards: 未知面板 ${panel}`);
    const arg = Array.isArray(args) ? args : [];
    if (method === 'list') {
      const limit = clampInt(arg[0], RECENT_LIMIT, 1, LIMIT_MAX);
      const includeVoided = arg[1] === true;
      const { cards, skipped } = readCards(this.#ctx.botDir);
      const shown = includeVoided ? cards : cards.filter((card) => !isVoided(card));
      return { total: shown.length, skipped, cards: shown.slice(-limit).reverse() };
    }
    if (method === 'search') {
      const q = String(arg[0] ?? '').trim();
      if (!q) return { query: '', total: 0, cards: [] };
      const includeVoided = arg[1] === true;
      const { cards } = readCards(this.#ctx.botDir);
      const pool = includeVoided ? cards : cards.filter((card) => !isVoided(card));
      const hits = searchCards(pool, q).reverse();
      return { query: q, total: hits.length, cards: hits.slice(0, RECENT_LIMIT) };
    }
    if (method === 'add') {
      const result = this.#addCard(arg[0] ?? {});
      if (result.error) throw new Error(result.error);
      return { ok: true, card: result.card };
    }
    if (method === 'answer') {
      const id = String(arg[0] ?? '').trim();
      const text = String(arg[1] ?? '').trim();
      if (!id) throw new Error('没补上：没给卡 id。');
      if (!text) throw new Error('没补上：答案是空的。');
      const result = appendAnswer(this.#ctx.botDir, id, text, todayOf(this.#ctx.timezone));
      if (result.error) throw new Error(result.error);
      return { ok: true, card: result.card };
    }
    if (method === 'void') {
      const id = String(arg[0] ?? '').trim();
      if (!id) throw new Error('没作废：没给卡 id。');
      const result = voidCard(this.#ctx.botDir, id, todayOf(this.#ctx.timezone));
      if (result.error) throw new Error(result.error);
      return { ok: true, card: result.card };
    }
    if (method === 'restore') {
      const id = String(arg[0] ?? '').trim();
      if (!id) throw new Error('没恢复：没给卡 id。');
      const result = restoreCard(this.#ctx.botDir, id);
      if (result.error) throw new Error(result.error);
      return { ok: true, card: result.card };
    }
    throw new Error(`reading-cards: 未知方法 ${panel}.${method}`);
  }

  tools() {
    return [
      {
        name: 'card_add',
        description: '存一张小卡。每张只装一件事：一句原话（kind=quote，text 一字不改）、一个想通了的地方（kind=idea，谁想通写进 by）、一个还没解开的问号（kind=question）。出处（哪本书哪一节、哪节课、谁说的）写进 source。不删卡；记错了就再存一张改正的。',
        tags: ['write'],
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '卡片正文：一句话。quote 必须一字不改。' },
            source: { type: 'string', description: '出处，例如「资本论·第一卷第四节」「线代·第二课」「他 11-08 说的」。' },
            kind: { type: 'string', enum: KINDS, description: 'quote=原话；idea=想通的；question=还没解开的。缺省 idea。' },
            by: { type: 'string', enum: BYS, description: '这句话是谁的：他 / 我 / 书。缺省 我。' },
            at: { type: 'string', description: '日期 YYYY-MM-DD；缺省用今天。' },
            tags: { type: 'array', items: { type: 'string' }, description: '小标签，例如 ["资本论","拜物教"]。' },
          },
          required: ['text'],
        },
        handler: async (args) => {
          const result = this.#addCard(args ?? {});
          if (result.error) return result.error;
          const { card, path } = result;
          return `已存 ${card.id}：${card.text}\n（${card.kind} · ${card.source || '未注明出处'} · ${card.by} · ${card.at}）\n文件：${path}`;
        },
      },
      {
        name: 'card_list',
        description: '按出处（source）或类型（kind）翻卡，按加入顺序分页返回。不带筛选就是整本最新的若干张。问题卡带补答时，行尾标出解了几条，答案缩进一条一行列在卡片行下面（带日期）；作废的卡默认不出现（includeVoided 可带上）。',
        tags: ['read', 'snapshot'],
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: '只看这个出处；须与存卡时写的完全一致。' },
            kind: { type: 'string', enum: KINDS, description: '只看这一类。' },
            limit: { type: 'integer', description: `本次最多几张，缺省 ${LIMIT_DEFAULT}，上限 ${LIMIT_MAX}。` },
            offset: { type: 'integer', description: '从第几张开始（0 起），缺省 0。' },
            includeVoided: { type: 'boolean', description: 'true = 连作废的也一并列出（行尾会标作废日期）。缺省 false。' },
          },
          required: [],
        },
        handler: async (args) => {
          const source = String(args?.source ?? '').trim();
          const kind = String(args?.kind ?? '').trim();
          const includeVoided = args?.includeVoided === true;
          const limit = clampInt(args?.limit, LIMIT_DEFAULT, 1, LIMIT_MAX);
          const offset = clampInt(args?.offset, 0, 0, Number.MAX_SAFE_INTEGER);
          const { cards, skipped } = readCards(this.#ctx.botDir);
          const voidedCount = cards.filter((card) => isVoided(card)).length;
          const filtered = cards.filter((card) => (includeVoided || !isVoided(card))
            && (!source || String(card.source ?? '') === source)
            && (!kind || String(card.kind ?? '') === kind));
          const total = filtered.length;
          if (total === 0) return `没有符合条件的卡（整本 ${cards.length} 张，${voidedCount} 张作废默认不列）。筛的：${source ? `source=${source} ` : ''}${kind ? `kind=${kind}` : ''}`.trim();
          const page = filtered.slice(offset, offset + limit);
          const head = `共 ${total} 张${source ? `（source=${source}）` : ''}${kind ? `（kind=${kind}）` : ''}；本次第 ${offset + 1}–${offset + page.length} 张：`;
          const notes = [];
          if (skipped > 0) notes.push(`有 ${skipped} 行读不出来，已跳过`);
          if (!includeVoided && voidedCount > 0) notes.push(`另有 ${voidedCount} 张作废，默认不列`);
          const tail = notes.length ? `\n（${notes.join('；')}）` : '';
          return `${head}\n${page.map(cardLine).join('\n')}${tail}`;
        },
      },
      {
        name: 'card_search',
        description: '关键词找卡：在正文、出处、by、kind、标签里做子串匹配，不区分大小写。够用了，不用向量。问题卡带补答时，答案会缩进一条一行列在卡片行下面（带日期）；作废的卡默认不出现（includeVoided 可带上）。',
        tags: ['read'],
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: '关键词，子串即可。' },
            source: { type: 'string', description: '先按出处收窄。' },
            kind: { type: 'string', enum: KINDS, description: '先按类型收窄。' },
            limit: { type: 'integer', description: `最多返回几张，缺省 ${LIMIT_DEFAULT}。` },
            includeVoided: { type: 'boolean', description: 'true = 连作废的也搜。缺省 false。' },
          },
          required: ['q'],
        },
        handler: async (args) => {
          const q = String(args?.q ?? '').trim();
          if (!q) return '没找：q 是空的。';
          const limit = clampInt(args?.limit, LIMIT_DEFAULT, 1, LIMIT_MAX);
          const includeVoided = args?.includeVoided === true;
          const { cards } = readCards(this.#ctx.botDir);
          const pool = includeVoided ? cards : cards.filter((card) => !isVoided(card));
          const hits = searchCards(pool, q, {
            source: String(args?.source ?? '').trim(),
            kind: String(args?.kind ?? '').trim(),
          });
          if (hits.length === 0) return `没有找到「${q}」的卡（整本 ${cards.length} 张，作废的不在新卡里）。`;
          const page = hits.slice(0, limit);
          return `关键词「${q}」命中 ${hits.length} 张${hits.length > page.length ? `，先给前 ${page.length} 张` : ''}：\n${page.map(cardLine).join('\n')}`;
        },
      },
      {
        name: 'card_book',
        description: '把没作废的卡按出处归拢，装订成一本 markdown，写到 data/书.md；回执报路径和条数（作废的不装订，只在摘要里报数）。不联网、不调模型。',
        tags: ['write', 'snapshot'],
        parameters: { type: 'object', properties: {}, required: [] },
        handler: async () => {
          const { cards } = readCards(this.#ctx.botDir);
          if (cards.length === 0) return '卡本还是空的，先 card_add 一张再装订。';
          const { path, count, sources, voided } = writeBook(this.#ctx.botDir, cards);
          if (count === 0) return `没有可装订的卡（${voided} 张都作废了）。`;
          return `已装订：${path}\n共 ${count} 张，${sources} 处出处。${voided > 0 ? `\n另有 ${voided} 张作废，没装订。` : ''}`;
        },
      },
      {
        name: 'card_answer',
        description: '往一张问题卡追加一条补答：只追加、不覆盖，日期由工具补成 `YYYY-MM-DD：`。非 question 卡会报错。',
        tags: ['write'],
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '卡 id，例如 c0005。' },
            text: { type: 'string', description: '补答正文：一句。' },
          },
          required: ['id', 'text'],
        },
        handler: async (args) => {
          const id = String(args?.id ?? '').trim();
          const text = String(args?.text ?? '').trim();
          if (!id) return '没补上：没给卡 id。';
          if (!text) return '没补上：答案是空的。';
          const result = appendAnswer(this.#ctx.botDir, id, text, todayOf(this.#ctx.timezone));
          if (result.error) return result.error;
          const answers = Array.isArray(result.card.answers) ? result.card.answers : [];
          return `已补答 ${result.card.id}（共 ${answers.length} 条）：${answers[answers.length - 1] ?? ''}\n文件：${cardsPathOf(this.#ctx.botDir)}`;
        },
      },
      {
        name: 'card_void',
        description: '作废一张卡：写 voidedAt 标记，不删 jsonl 行；正文、出处、答案都不动。undo=true 则恢复（清掉 voidedAt）。默认 card_list / card_search / card_book 都跳过作废的卡。',
        tags: ['write'],
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '卡 id，例如 c0002。' },
            undo: { type: 'boolean', description: 'true = 恢复这张卡（清掉 voidedAt）；缺省 false = 作废。' },
          },
          required: ['id'],
        },
        handler: async (args) => {
          const id = String(args?.id ?? '').trim();
          const undo = args?.undo === true;
          if (!id) return '没动：没给卡 id。';
          const result = undo
            ? restoreCard(this.#ctx.botDir, id)
            : voidCard(this.#ctx.botDir, id, todayOf(this.#ctx.timezone));
          if (result.error) return result.error;
          return undo
            ? `已恢复 ${result.card.id}（voidedAt 已清，jsonl 行没动）。`
            : `已作废 ${result.card.id}（voidedAt=${result.card.voidedAt}；jsonl 行没删，正文/出处/答案都没动）。`;
        },
      },
    ];
  }

  /** 环境模板没有占位变量：返回空对象，保留模板全文（返回 null 会省略整段）。 */
  envPromptVars() {
    return {};
  }

  webUi(language = 'zh') {
    const { cards } = readCards(this.#ctx.botDir);
    const sources = groupBySource(cards).size;
    return {
      label: language === 'en' ? 'Reading cards' : '读书小卡',
      lamps: [
        {
          label: language === 'en' ? 'Cards' : '卡本',
          state: cards.length > 0 ? 'online' : 'offline',
          hint: cards.length > 0
            ? (language === 'en' ? `${cards.length} cards` : `已存 ${cards.length} 张`)
            : (language === 'en' ? 'empty' : '还空着'),
        },
      ],
      badges: [
        { label: language === 'en' ? 'cards' : '张数', value: cards.length },
        { label: language === 'en' ? 'sources' : '出处', value: sources },
      ],
      panels: [
        {
          id: PAGE_PANEL_ID,
          title: language === 'en' ? 'Cards' : '翻卡',
          description: language === 'en'
            ? 'Write one card, search them, or read the most recent ones.'
            : '写一张卡、按关键词搜、看最近攒下的几张；问题卡能补答。',
        },
      ],
      invoke: (panel, method, args) => this.#invoke(panel, method, args),
      promptDocs: [
        {
          key: `worlds.${READING_CARDS_ID}.envPrompt`,
          title: language === 'en' ? 'Reading cards · environment prompt' : '读书小卡 · 环境提示词',
          description: language === 'en'
            ? 'The two lines this World adds to the system prefix every turn.'
            : '这个小卡 World 每轮加进系统前缀的两行。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [],
        },
      ],
    };
  }
}
