/* 读书小卡 · World 页面（手写 ESM，无构建步骤）。
 * 契约见 cortico/src/web/shared/client-panel.ts：default { panels: { id: { mount(ctx) } } }。
 * 面板 id 'cards' 必须与 src/world.js 的 PAGE_PANEL_ID 一致；数据面走 ctx.invoke(method, args)。
 */

const ZH = (language) => language === 'zh' || language === 'zh-Hant';

const T = {
  zh: {
    addTitle: '写一张',
    addHint: '每张只装一件事。原话（quote）一字不改；出处写清楚哪本书哪一节、哪节课、谁说的。',
    textPlaceholder: '一句话。',
    source: '出处',
    sourcePlaceholder: '资本论·第一章第四节 / 线代·第二课 / 他 11-08 说的',
    kind: '类型',
    by: '谁说的',
    tags: '标签',
    tagsPlaceholder: '逗号分隔，如 资本论,拜物教',
    save: '存进卡本',
    saving: '正在存…',
    saved: (id) => `已存${id ? ` ${id}` : ''}`,
    saveFailed: '没存上：',
    searchTitle: '搜卡',
    searchPlaceholder: '关键词：正文 / 出处 / 标签…',
    search: '搜',
    searchEmpty: '输入关键词再回车或点「搜」。',
    noResult: (q) => `没有找到「${q}」的卡。`,
    resultCount: (n) => `命中 ${n} 张`,
    recentTitle: '最近',
    refresh: '刷新',
    empty: '卡本还空着。在上面写第一张。',
    failed: '读取失败：',
    skipped: (n) => `（有 ${n} 行读不出来，已跳过）`,
    noSource: '未注明出处',
    quote: '原话',
    idea: '想通的',
    question: '问号',
    solved: '解了',
    answerPlaceholder: '补一句：解到哪了 / 答案是什么',
    answerSave: '补答',
    answerEmpty: '答案不能是空的。',
    answerSaved: '补上了。',
    answerFailed: '没补上：',
    void: '作废',
    voidConfirm: '再点一次确认作废',
    voided: '作废',
    voidDone: '作废了，能捞回来',
    voidFailed: '没作废：',
    restore: '恢复',
    restored: '捞回来了',
    restoreFailed: '没恢复：',
    showVoided: '看作废的',
  },
  en: {
    addTitle: 'Write one',
    addHint: 'One card, one thing. A quote must be word-for-word; say exactly where it came from.',
    textPlaceholder: 'One sentence.',
    source: 'Source',
    sourcePlaceholder: 'Capital vol.1 ch.4 / Linear algebra lesson 2 / what he said on 11-08',
    kind: 'Kind',
    by: 'Whose',
    tags: 'Tags',
    tagsPlaceholder: 'comma separated, e.g. capital,fetishism',
    save: 'Save to the deck',
    saving: 'Saving…',
    saved: (id) => `Saved${id ? ` ${id}` : ''}`,
    saveFailed: 'Not saved: ',
    searchTitle: 'Search',
    searchPlaceholder: 'Keyword: text / source / tags…',
    search: 'Search',
    searchEmpty: 'Type a keyword and press Enter.',
    noResult: (q) => `No card matches “${q}”.`,
    resultCount: (n) => `${n} match(es)`,
    recentTitle: 'Recent',
    refresh: 'Refresh',
    empty: 'The deck is empty. Write the first card above.',
    failed: 'Failed to read: ',
    skipped: (n) => ` (${n} unreadable line(s) skipped)`,
    noSource: 'no source',
    quote: 'quote',
    idea: 'idea',
    question: 'question',
    solved: 'solved',
    answerPlaceholder: 'Add one line: where you got to / the answer',
    answerSave: 'Answer',
    answerEmpty: 'The answer is empty.',
    answerSaved: 'Answer added.',
    answerFailed: 'Not added: ',
    void: 'Void',
    voidConfirm: 'Click again to confirm',
    voided: 'voided',
    voidDone: 'Voided — you can get it back',
    voidFailed: 'Not voided: ',
    restore: 'Restore',
    restored: 'Restored',
    restoreFailed: 'Not restored: ',
    showVoided: 'Show voided',
  },
};

const KINDS = ['idea', 'quote', 'question'];
const BYS = ['我', '他', '书'];

function tr(ctx) {
  return ZH(ctx.language) ? T.zh : T.en;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child);
  }
  return node;
}

function msgOf(err) {
  return err && err.message ? err.message : String(err);
}

function button(label, onClick, kind) {
  const node = el('button', { class: kind ? `rc-btn ${kind}` : 'rc-btn', type: 'button' }, label);
  node.addEventListener('click', onClick);
  return node;
}

/** 一张卡的显示。问题卡下面列已有补答，并带一个「补答」输入框；作废的卡半透明、只给「恢复」。 */
function cardEl(ctx, card, t, onChanged) {
  const kind = String(card.kind ?? 'idea');
  const source = String(card.source ?? '').trim();
  const tags = Array.isArray(card.tags) ? card.tags.map(String).filter(Boolean) : [];
  const answers = Array.isArray(card.answers) ? card.answers.map(String).filter((item) => item.trim()) : [];
  const solved = kind === 'question' && answers.length > 0;
  const voided = typeof card.voidedAt === 'string' && card.voidedAt.trim() !== '';
  const meta = [source || t.noSource, String(card.by ?? ''), String(card.at ?? '')].filter(Boolean).join(' · ');
  const head = el('div', { class: 'rc-card-head' },
    el('span', { class: `rc-kind rc-kind-${kind}`, text: `${kind} · ${t[kind] ?? ''}` }),
    solved ? el('span', { class: 'rc-solved', text: `${t.solved} ${answers.length}` }) : null,
    voided ? el('span', { class: 'rc-voided-pill', text: `${t.voided} ${card.voidedAt}` }) : null,
    el('span', { class: 'rc-id', text: String(card.id ?? '') }),
  );
  const node = el('article', { class: solved ? 'rc-card rc-solved-card' : 'rc-card' },
    head,
    el('div', { class: 'rc-text', text: String(card.text ?? '') }),
    el('div', { class: 'rc-meta', text: meta }),
    tags.length ? el('div', { class: 'rc-tags' }, ...tags.map((tag) => el('span', { class: 'rc-tag', text: `#${tag}` }))) : null,
    answers.length ? el('div', { class: 'rc-answers' }, ...answers.map((answer) => el('div', { class: 'rc-answer', text: answer }))) : null,
    kind === 'question' && !voided ? answerBox(ctx, card, t, onChanged) : null,
  );
  const actions = el('div', { class: 'rc-card-actions' });
  if (voided) {
    node.classList.add('rc-voided');
    actions.append(button(t.restore, () => { void restoreCard(); }));
  } else {
    actions.append(voidButton());
  }
  head.append(actions);

  async function restoreCard() {
    try {
      await ctx.invoke('restore', [String(card.id)]);
      ctx.ui.toast(t.restored, 'ok');
      await onChanged();
    } catch (err) {
      ctx.ui.toast(t.restoreFailed + msgOf(err), 'bad');
    }
  }

  /** 两段式作废：第一下只进确认态，第二下才真提交。 */
  function voidButton() {
    const btn = el('button', { class: 'rc-void-btn', type: 'button' }, t.void);
    const hint = el('div', { class: 'rc-void-hint', text: t.voidConfirm });
    let armed = false;
    const disarm = () => {
      armed = false;
      node.classList.remove('rc-void-confirm');
      if (hint.isConnected) hint.remove();
    };
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        node.classList.add('rc-void-confirm');
        node.append(hint);
        return;
      }
      void (async () => {
        btn.disabled = true;
        try {
          await ctx.invoke('void', [String(card.id)]);
          ctx.ui.toast(t.voidDone, 'ok');
          await onChanged();
        } catch (err) {
          ctx.ui.toast(t.voidFailed + msgOf(err), 'bad');
          disarm();
        } finally {
          btn.disabled = false;
        }
      })();
    });
    return btn;
  }

  return node;
}

/** 问题卡的「补答」：一条输入 + 按钮，只往后追加，不覆盖旧答案。 */
function answerBox(ctx, card, t, onAnswered) {
  const input = el('input', { class: 'rc-input rc-answer-input', placeholder: t.answerPlaceholder });
  const save = button(t.answerSave, () => { void submit(); });
  async function submit() {
    const text = input.value.trim();
    if (!text) { ctx.ui.toast(t.answerEmpty, 'bad'); return; }
    save.disabled = true;
    try {
      await ctx.invoke('answer', [String(card.id), text]);
      input.value = '';
      ctx.ui.toast(t.answerSaved, 'ok');
      await onAnswered();
    } catch (err) {
      ctx.ui.toast(t.answerFailed + msgOf(err), 'bad');
    } finally {
      save.disabled = false;
    }
  }
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void submit();
  });
  return el('div', { class: 'rc-answer-row' }, input, save);
}

function mountCards(ctx) {
  const t = tr(ctx);
  const root = ctx.root;
  root.classList.add('rc-panel');
  clear(root);

  let statusTimer = null;
  const setStatus = (text, tone) => {
    status.textContent = text;
    status.className = tone ? `rc-status rc-status-${tone}` : 'rc-status';
    if (statusTimer) clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => { status.textContent = ''; }, 6000);
  };

  // ── 写一张 ──────────────────────────────────────────────
  const status = el('span', { class: 'rc-status' });
  const textArea = el('textarea', { class: 'rc-textarea', rows: '3', placeholder: t.textPlaceholder, required: 'required' });
  const sourceInput = el('input', { class: 'rc-input', placeholder: t.sourcePlaceholder });
  const kindSelect = el('select', { class: 'rc-select' }, ...KINDS.map((kind) => el('option', { value: kind }, `${kind} · ${t[kind]}`)));
  const bySelect = el('select', { class: 'rc-select' }, ...BYS.map((by) => el('option', { value: by }, by)));
  const tagsInput = el('input', { class: 'rc-input', placeholder: t.tagsPlaceholder });
  const submitBtn = el('button', { class: 'rc-btn rc-btn-primary', type: 'submit' }, t.save);
  const form = el('form', { class: 'rc-form' },
    textArea,
    el('div', { class: 'rc-grid' },
      el('label', { class: 'rc-field' }, el('span', { class: 'rc-label', text: t.source }), sourceInput),
      el('label', { class: 'rc-field' }, el('span', { class: 'rc-label', text: t.kind }), kindSelect),
      el('label', { class: 'rc-field' }, el('span', { class: 'rc-label', text: t.by }), bySelect),
      el('label', { class: 'rc-field' }, el('span', { class: 'rc-label', text: t.tags }), tagsInput),
    ),
    el('div', { class: 'rc-row' }, submitBtn, status),
  );

  // ── 搜卡 ────────────────────────────────────────────────
  const searchInput = el('input', { class: 'rc-input rc-search-input', placeholder: t.searchPlaceholder });
  const searchBtn = el('button', { class: 'rc-btn', type: 'button' }, t.search);
  const results = el('div', { class: 'rc-results' });

  // ── 最近 ────────────────────────────────────────────────
  const recentBox = el('div', { class: 'rc-recent' });
  const refreshBtn = button(t.refresh, () => { void refreshRecent(); });
  // 「看作废的」开关：只影响这一页的列表与搜索结果，不改数据。
  const showVoidedBox = el('input', { type: 'checkbox', class: 'rc-void-toggle-input' });
  const showVoidedLabel = el('label', { class: 'rc-void-toggle' }, showVoidedBox, el('span', { text: t.showVoided }));
  showVoidedBox.addEventListener('change', () => {
    void refreshRecent();
    if (searchInput.value.trim()) void doSearch();
  });
  const includeVoided = () => showVoidedBox.checked;

  const onChanged = async () => {
    await refreshRecent();
    if (searchInput.value.trim()) await doSearch();
  };

  const renderCards = (container, cards) => {
    for (const card of cards) container.append(cardEl(ctx, card, t, onChanged));
  };

  async function refreshRecent() {
    try {
      const out = await ctx.invoke('list', [20, includeVoided()]);
      clear(recentBox);
      const cards = Array.isArray(out?.cards) ? out.cards : [];
      if (out?.skipped) recentBox.append(el('div', { class: 'rc-hint', text: t.skipped(out.skipped) }));
      if (!cards.length) { recentBox.append(el('div', { class: 'rc-hint', text: t.empty })); return; }
      renderCards(recentBox, cards);
    } catch (err) {
      clear(recentBox);
      recentBox.append(el('div', { class: 'rc-error', text: t.failed + msgOf(err) }));
    }
  }

  async function doSearch() {
    const q = searchInput.value.trim();
    clear(results);
    if (!q) { results.append(el('div', { class: 'rc-hint', text: t.searchEmpty })); return; }
    searchBtn.disabled = true;
    try {
      const out = await ctx.invoke('search', [q, includeVoided()]);
      clear(results);
      const cards = Array.isArray(out?.cards) ? out.cards : [];
      results.append(el('div', { class: 'rc-count', text: t.resultCount(Number(out?.total ?? cards.length)) }));
      if (!cards.length) results.append(el('div', { class: 'rc-hint', text: t.noResult(q) }));
      else renderCards(results, cards);
    } catch (err) {
      clear(results);
      results.append(el('div', { class: 'rc-error', text: t.failed + msgOf(err) }));
    } finally {
      searchBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const text = textArea.value.trim();
      if (!text) { setStatus(t.saveFailed + 'text is empty', 'error'); return; }
      submitBtn.disabled = true;
      setStatus(t.saving, '');
      try {
        const out = await ctx.invoke('add', [{
          text,
          source: sourceInput.value,
          kind: kindSelect.value,
          by: bySelect.value,
          tags: tagsInput.value.split(/[，,、\s]+/).map((tag) => tag.trim()).filter(Boolean),
        }]);
        setStatus(t.saved(out?.card?.id ?? ''), 'ok');
        textArea.value = '';
        tagsInput.value = '';
        await refreshRecent();
        if (searchInput.value.trim()) await doSearch();
      } catch (err) {
        setStatus(t.saveFailed + msgOf(err), 'error');
      } finally {
        submitBtn.disabled = false;
      }
    })();
  });
  searchBtn.addEventListener('click', () => { void doSearch(); });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void doSearch();
  });

  root.append(
    el('section', { class: 'rc-sec' },
      el('div', { class: 'rc-sec-head' },
        el('h3', { class: 'rc-sec-title', text: t.addTitle }),
        el('div', { class: 'rc-sec-hint', text: t.addHint }),
      ),
      form,
    ),
    el('section', { class: 'rc-sec' },
      el('div', { class: 'rc-sec-head' }, el('h3', { class: 'rc-sec-title', text: t.searchTitle })),
      el('div', { class: 'rc-search-row' }, searchInput, searchBtn),
      results,
    ),
    el('section', { class: 'rc-sec' },
      el('div', { class: 'rc-sec-head' },
        el('h3', { class: 'rc-sec-title', text: t.recentTitle }),
        el('div', { class: 'rc-sec-actions' }, showVoidedLabel, refreshBtn),
      ),
      recentBox,
    ),
  );

  void refreshRecent();
}

export default {
  panels: {
    cards: { mount: mountCards },
  },
};
