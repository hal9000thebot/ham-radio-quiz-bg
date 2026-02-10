const ROOT = document.getElementById('root');

const SESSION_SIZE = 30;

// ---- Progress tracking (localStorage) ----
const PROGRESS_KEY = 'hamQuizProgressV1';

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { byQid: {}, byTopic: {}, total: { attempts: 0, correct: 0 }, bestStreak: 0, lastSession: null };
    const obj = JSON.parse(raw);
    return obj;
  } catch {
    return { byQid: {}, byTopic: {}, total: { attempts: 0, correct: 0 }, bestStreak: 0, lastSession: null };
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

function updateProgress(progress, q, isCorrect) {
  const qid = q.id;
  const topic = q.topic || 'Общи';

  progress.total = progress.total || { attempts: 0, correct: 0 };
  progress.total.attempts += 1;
  if (isCorrect) progress.total.correct += 1;

  progress.byQid = progress.byQid || {};
  const pq = progress.byQid[qid] || { attempts: 0, correct: 0, lastCorrect: null, lastSeen: null };
  pq.attempts += 1;
  if (isCorrect) pq.correct += 1;
  pq.lastCorrect = isCorrect;
  pq.lastSeen = Date.now();
  progress.byQid[qid] = pq;

  progress.byTopic = progress.byTopic || {};
  const pt = progress.byTopic[topic] || { attempts: 0, correct: 0 };
  pt.attempts += 1;
  if (isCorrect) pt.correct += 1;
  progress.byTopic[topic] = pt;
}

function pct(correct, attempts) {
  if (!attempts) return 0;
  return Math.round((correct / attempts) * 100);
}

function shuffle(arr) {
  // Fisher–Yates
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (v === null || v === undefined || v === false) {
      // skip null-ish attributes
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'disabled') node.disabled = Boolean(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.appendChild(c);
  return node;
}

function renderLoading() {
  ROOT.innerHTML = '';
  ROOT.appendChild(el('div', { class: 'card' }, [el('p', { text: 'Зареждане…' })]));
}

function renderError(err) {
  ROOT.innerHTML = '';
  ROOT.appendChild(
    el('div', { class: 'card' }, [
      el('p', { text: 'Грешка при зареждане.' }),
      el('p', { class: 'code', text: String(err) }),
    ])
  );
}

function renderIntro({ banks, selectedSectionIds, onToggleSection, onSelectAll, onStart }) {
  const totalSelected = banks.sections
    .filter(s => selectedSectionIds.includes(s.id))
    .reduce((sum, s) => sum + (s.count || 0), 0);

  ROOT.innerHTML = '';
  ROOT.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'pill', text: `Избрани въпроси: ${totalSelected}` }),
        el('span', { class: 'pill', text: `Сесия: ${SESSION_SIZE} въпроса` }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'secondary', text: 'Избери всички', onClick: onSelectAll }),
      ]),

      el('p', { class: 'sub', text: 'Избери кои раздели да се включат в теста:' }),

      el('div', { class: 'choices' }, banks.sections.map(sec => {
        const checked = selectedSectionIds.includes(sec.id);
        const btn = el('button', {
          class: 'choice',
          onClick: () => onToggleSection(sec.id),
        }, [
          el('span', { class: 'label', text: checked ? '☑' : '☐' }),
          el('span', { text: `${sec.label} (${sec.count})` })
        ]);
        if (checked) {
          btn.style.borderColor = 'rgba(122,162,255,.65)';
          btn.style.background = 'rgba(122,162,255,.10)';
        }
        return btn;
      })),

      el('p', { class: 'q', text: 'Ще получиш 30 случайни въпроса от избраните раздели. След всеки отговор ще видиш дали е верен + кратко обяснение.' }),

      el('div', { class: 'actions' }, [
        el('button', {
          class: 'primary',
          text: 'Старт',
          onClick: onStart,
          disabled: selectedSectionIds.length === 0,
        }),
      ])
    ])
  );
}

function renderQuestion(state) {
  const { session, idx, answers } = state;
  const q = session[idx];

  const answered = answers[q.id];

  ROOT.innerHTML = '';

  const header = el('div', { class: 'row' }, [
    el('span', { class: 'pill', text: `Въпрос ${idx + 1} / ${session.length}` }),
    el('span', { class: 'pill', text: `Резултат: ${state.correctCount} ✅ / ${idx} отговорени` }),
    el('span', { class: 'pill', text: `Серия: ${state.sessionStreak}` }),
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'secondary',
      text: 'Рестарт',
      onClick: () => state.reset(),
    })
  ]);

  const qText = el('p', { class: 'q', text: q.question });

  const choicesOrder = ['А', 'Б', 'В', 'Г'];

  const choices = el('div', { class: 'choices' }, choicesOrder.map(letter => {
    const text = q.choices[letter];

    const btn = el('button', {
      class: 'choice',
      disabled: Boolean(answered),
      onClick: () => {
        if (answered) return;
        state.openConfirm(letter);
      }
    }, [
      el('span', { class: 'label', text: `${letter}.` }),
      el('span', { text })
    ]);

    // Visual cue for pending choice
    if (!answered && state.pendingSelection && state.pendingSelection.letter === letter) {
      btn.style.borderColor = 'rgba(122,162,255,.65)';
      btn.style.background = 'rgba(122,162,255,.12)';
    }

    if (answered) {
      if (letter === q.answer) btn.classList.add('good');
      if (letter === answered.selected && answered.selected !== q.answer) btn.classList.add('bad');
    }

    return btn;
  }));

  const cardChildren = [header, qText, choices];

  if (answered) {
    const isCorrect = answered.selected === q.answer;
    const fb = el('div', { class: `feedback ${isCorrect ? 'good' : 'bad'}` }, [
      el('h3', { text: isCorrect ? 'Вярно ✅' : 'Грешно ❌' }),
      el('p', { text: `Правилен отговор: ${q.answer}. ${q.choices[q.answer]}` }),
      el('p', { text: q.explanation || '' }),
    ]);

    const nextBtn = el('button', {
      class: 'primary',
      text: idx === session.length - 1 ? 'Край (резултати)' : 'Следващ въпрос',
      onClick: () => state.next(),
    });

    cardChildren.push(fb, el('div', { class: 'actions' }, [nextBtn]));
  }

  ROOT.appendChild(el('div', { class: 'card' }, cardChildren));

  // In-app confirm modal (works in in-app browsers that block window.confirm)
  if (state.pendingSelection && state.pendingSelection.qid === q.id && !answered) {
    const letter = state.pendingSelection.letter;
    const modal = el('div', { class: 'modal-backdrop' }, [
      el('div', { class: 'modal' }, [
        el('h3', { text: 'Потвърди избор' }),
        el('p', { text: `Сигурен ли си, че избираш отговор ${letter}?` }),
        el('div', { class: 'actions' }, [
          el('button', { class: 'secondary', text: 'Отказ', onClick: () => state.closeConfirm() }),
          el('button', { class: 'primary', text: 'Да, избери', onClick: () => state.confirmSelection() }),
        ])
      ])
    ]);
    document.body.appendChild(modal);

    // Close if clicking backdrop
    modal.addEventListener('click', (e) => {
      if (e.target === modal) state.closeConfirm();
    });

    state._modalEl = modal;
  }
}

function renderResults(state) {
  const { session, answers } = state;
  const total = session.length;
  const correct = state.correctCount;
  const pct = Math.round((correct / total) * 100);

  const wrong = session
    .filter(q => answers[q.id]?.selected && answers[q.id].selected !== q.answer)
    .map(q => ({
      q,
      selected: answers[q.id].selected,
    }));

  ROOT.innerHTML = '';

  const actionButtons = [
    el('button', { class: 'primary', text: 'Нова сесия', onClick: () => state.reset() }),
  ];

  if (wrong.length) {
    actionButtons.unshift(
      el('button', { class: 'secondary', text: 'Преговор (само грешните)', onClick: () => state.startReviewWrong() })
    );
  }

  const overallAttempts = state.progress?.total?.attempts || 0;
  const overallCorrect = state.progress?.total?.correct || 0;
  const overallPct = pct(overallCorrect, overallAttempts);

  // Weak areas (min 5 attempts)
  const topicEntries = Object.entries(state.progress?.byTopic || {})
    .map(([topic, v]) => ({ topic, attempts: v.attempts || 0, correct: v.correct || 0, pct: pct(v.correct || 0, v.attempts || 0) }))
    .filter(x => x.attempts >= 5)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  ROOT.appendChild(
    el('div', { class: 'card results' }, [
      el('h2', { text: `Резултат: ${correct} / ${total} (${pct}%)` }),
      el('p', { class: 'sub', text: `Грешни: ${wrong.length}.` }),
      el('p', { class: 'sub', text: `Общо (всички сесии): ${overallCorrect}/${overallAttempts} (${overallPct}%)` }),
      el('div', { class: 'actions' }, actionButtons),
      topicEntries.length
        ? el('div', {}, [
            el('p', { class: 'sub', text: 'Слаби теми (по точност):' }),
            el('ul', {}, topicEntries.map(t => el('li', { text: `${t.topic}: ${t.correct}/${t.attempts} (${t.pct}%)` })))
          ])
        : el('p', { class: 'sub', text: 'Натрупай поне 5 опита по тема, за да видиш “слаби теми”.' }),
      wrong.length
        ? el('div', {}, [
            el('p', { class: 'sub', text: 'Преглед на грешните:' }),
            el('ul', {}, wrong.map(({ q, selected }) => {
              const line = `(${q.num}) ${q.question} — ти: ${selected}, вярно: ${q.answer}`;
              return el('li', { text: line });
            }))
          ])
        : el('p', { class: 'sub', text: 'Нямаш грешки. Браво.' }),
    ])
  );
}

const SECTION_SELECTION_KEY = 'hamQuizSelectedSectionsV1';

async function loadBanks() {
  const res = await fetch('./data/banks.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function loadSelectedSections(defaultIds) {
  try {
    const raw = localStorage.getItem(SECTION_SELECTION_KEY);
    if (!raw) return defaultIds;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return arr;
    return defaultIds;
  } catch {
    return defaultIds;
  }
}

function saveSelectedSections(ids) {
  try {
    localStorage.setItem(SECTION_SELECTION_KEY, JSON.stringify(ids));
  } catch {}
}

async function loadSectionQuestions(file) {
  const res = await fetch(`./data/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.filter(q => q && q.question && q.choices && q.choices['А'] && q.choices['Б'] && q.choices['В'] && q.choices['Г']);
}

function createState({ allQuestions, banks, selectedSectionIds }) {
  const state = {
    allQuestions,
    banks,
    selectedSectionIds,
    session: [],
    idx: 0,
    answers: {},
    correctCount: 0,
    mode: 'intro', // intro | quiz | results

    pendingSelection: null,
    _modalEl: null,

    // Progress tracking
    progress: loadProgress(),
    sessionStreak: 0,

    _cleanupModal() {
      if (this._modalEl) {
        try { this._modalEl.remove(); } catch {}
        this._modalEl = null;
      }
    },

    openConfirm(letter) {
      const q = this.session[this.idx];
      this._cleanupModal();
      this.pendingSelection = { qid: q.id, letter };
      renderQuestion(this);
    },

    closeConfirm() {
      this.pendingSelection = null;
      this._cleanupModal();
      renderQuestion(this);
    },

    confirmSelection() {
      if (!this.pendingSelection) return;
      const { letter } = this.pendingSelection;
      this.pendingSelection = null;
      this._cleanupModal();
      this.answerCurrent(letter);
    },

    start() {
      this._cleanupModal();
      this.pendingSelection = null;
      this.session = sample(this.allQuestions, Math.min(SESSION_SIZE, this.allQuestions.length));
      this.idx = 0;
      this.answers = {};
      this.correctCount = 0;
      this.sessionStreak = 0;
      this.mode = 'quiz';
      renderQuestion(this);
    },

    startReviewWrong() {
      // Build a new session from the wrong answers in the last session
      const wrongQs = this.session.filter(q => this.answers[q.id]?.selected && this.answers[q.id].selected !== q.answer);
      this._cleanupModal();
      this.pendingSelection = null;
      this.session = shuffle(wrongQs);
      this.idx = 0;
      this.answers = {};
      this.correctCount = 0;
      this.sessionStreak = 0;
      this.mode = 'quiz';
      renderQuestion(this);
    },

    answerCurrent(letter) {
      const q = this.session[this.idx];
      const isCorrect = letter === q.answer;

      this.answers[q.id] = { selected: letter };
      if (isCorrect) {
        this.correctCount += 1;
        this.sessionStreak += 1;
      } else {
        this.sessionStreak = 0;
      }

      // Persist progress stats
      updateProgress(this.progress, q, isCorrect);
      saveProgress(this.progress);

      renderQuestion(this);
    },

    next() {
      this._cleanupModal();
      this.pendingSelection = null;
      if (this.idx >= this.session.length - 1) {
        this.mode = 'results';
        renderResults(this);
        return;
      }
      this.idx += 1;
      renderQuestion(this);
    },

    reset() {
      this._cleanupModal();
      this.pendingSelection = null;
      this.mode = 'intro';
      // main() wires intro rendering with callbacks
      if (typeof this.showIntro === 'function') this.showIntro();
    },
  };
  return state;
}

(async function main() {
  try {
    renderLoading();

    const banks = await loadBanks();
    const defaultIds = banks.sections.map(s => s.id);
    let selectedSectionIds = loadSelectedSections(defaultIds);

    async function loadSelectedQuestions() {
      const secs = banks.sections.filter(s => selectedSectionIds.includes(s.id));
      const loaded = await Promise.all(secs.map(s => loadSectionQuestions(s.file)));
      return loaded.flat();
    }

    let allQuestions = await loadSelectedQuestions();

    const state = createState({ allQuestions, banks, selectedSectionIds });

    async function toggleSection(id) {
      const set = new Set(selectedSectionIds);
      if (set.has(id)) set.delete(id); else set.add(id);
      selectedSectionIds = Array.from(set);
      saveSelectedSections(selectedSectionIds);

      state.selectedSectionIds = selectedSectionIds;
      state.allQuestions = await loadSelectedQuestions();
      state.showIntro();
    }

    async function selectAll() {
      selectedSectionIds = banks.sections.map(s => s.id);
      saveSelectedSections(selectedSectionIds);

      state.selectedSectionIds = selectedSectionIds;
      state.allQuestions = await loadSelectedQuestions();
      state.showIntro();
    }

    state.showIntro = () => {
      renderIntro({
        banks,
        selectedSectionIds,
        onToggleSection: toggleSection,
        onSelectAll: selectAll,
        onStart: () => state.start(),
      });
    };

    state.showIntro();
  } catch (err) {
    renderError(err);
  }
})();
