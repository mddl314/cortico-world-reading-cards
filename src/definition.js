/**
 * World 定义：装配层挂载它、Core 按它构造实例。
 */
import { READING_CARDS_ID } from './config.js';
import { ReadingCardsWorld } from './world.js';

/** 工具说明（发给模型的那份在 world.js 的 tools()，这里只给扩展市场看）。 */
const TOOL_DESCRIBE = {
  add: '存一张小卡：一句原话（quote，一字不改）、一个想通的地方（idea）或一个还没解开的问号（question）。出处写进 source。没有删除，记错了再存一张改正的。',
  list: '按出处或类型翻卡，按加入顺序分页返回。',
  search: '关键词找卡：正文、出处、by、kind、标签里做子串匹配。',
  book: '把卡按出处归拢，导出成一本 markdown（data/书.md），回执报路径和条数。',
};

/** 自描述（扩展市场读它，不执行包代码）。 */
const DESCRIBE = {
  tools: [
    {
      name: 'card_add',
      description: TOOL_DESCRIBE.add,
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '卡片正文：一句话。quote 必须一字不改。' },
          source: { type: 'string', description: '出处，例如「资本论·第一卷第四节」「线代·第二课」。' },
          kind: { type: 'string', enum: ['quote', 'idea', 'question'], description: 'quote=原话；idea=想通的；question=还没解开的。' },
          by: { type: 'string', enum: ['他', '我', '书'], description: '这句话是谁的。' },
          at: { type: 'string', description: '日期 YYYY-MM-DD；缺省今天。' },
          tags: { type: 'array', items: { type: 'string' }, description: '小标签。' },
        },
        required: ['text'],
      },
      tags: ['write'],
      summary: { zh: '存一张小卡', en: 'Save one reading card' },
    },
    {
      name: 'card_list',
      description: TOOL_DESCRIBE.list,
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '只看这个出处。' },
          kind: { type: 'string', enum: ['quote', 'idea', 'question'], description: '只看这一类。' },
          limit: { type: 'integer', description: '本次最多几张。' },
          offset: { type: 'integer', description: '从第几张开始（0 起）。' },
        },
        required: [],
      },
      tags: ['read', 'snapshot'],
      summary: { zh: '按出处或类型翻卡', en: 'List cards by source or kind' },
    },
    {
      name: 'card_search',
      description: TOOL_DESCRIBE.search,
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '关键词，子串即可。' },
          source: { type: 'string', description: '先按出处收窄。' },
          kind: { type: 'string', enum: ['quote', 'idea', 'question'], description: '先按类型收窄。' },
          limit: { type: 'integer', description: '最多返回几张。' },
        },
        required: ['q'],
      },
      tags: ['read'],
      summary: { zh: '关键词找卡', en: 'Search cards by keyword' },
    },
    {
      name: 'card_book',
      description: TOOL_DESCRIBE.book,
      parameters: { type: 'object', properties: {}, required: [] },
      tags: ['write', 'snapshot'],
      summary: { zh: '按出处装订成一本', en: 'Bind all cards into one book by source' },
    },
    {
      name: 'card_answer',
      description: '往一张问题卡追加一条补答：只追加、不覆盖，日期由工具补成 YYYY-MM-DD：。非 question 卡会报错。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '卡 id，例如 c0005。' },
          text: { type: 'string', description: '补答正文：一句。' },
        },
        required: ['id', 'text'],
      },
      tags: ['write'],
      summary: { zh: '给问题卡补一条答案', en: 'Append one answer to a question card' },
    },
    {
      name: 'card_void',
      description: '作废一张卡：写 voidedAt 标记，不删 jsonl 行；undo=true 恢复。默认 list/search/book 跳过作废的卡。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '卡 id，例如 c0002。' },
          undo: { type: 'boolean', description: 'true = 恢复；缺省 false = 作废。' },
        },
        required: ['id'],
      },
      tags: ['write'],
      summary: { zh: '作废 / 恢复一张卡', en: 'Void or restore a card' },
    },
  ],
  events: [],
};

/** 定义；只有 id / label / defaults / describe / create 这几项。 */
export function readingCardsDefinition() {
  return {
    id: READING_CARDS_ID,
    label: '读书小卡',
    defaults: () => ({ enabled: false }),
    describe: DESCRIBE,
    create: (ctx) => new ReadingCardsWorld(ctx),
  };
}

/** 没有宿主装配时的定义（中文）。扩展加载器取默认导出。 */
export const READING_CARDS = readingCardsDefinition();
