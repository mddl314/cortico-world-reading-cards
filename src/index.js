/**
 * 扩展入口：加载器取默认导出 = WorldDefinition。
 */
export { READING_CARDS, readingCardsDefinition } from './definition.js';
export { READING_CARDS as default } from './definition.js';
export { READING_CARDS_ID, CARDS_FILE, BOOK_FILE, worldDataDir, cardsPathOf, bookPathOf } from './config.js';
export { ReadingCardsWorld } from './world.js';
export { readCards, nextCardId, appendCard, searchCards, groupBySource, renderBook, writeBook } from './store.js';
