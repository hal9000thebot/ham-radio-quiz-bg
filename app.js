const ROOT = document.getElementById('root');

const SESSION_SIZE = 30;

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
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
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

function renderIntro({ totalQuestions, onStart }) {
  ROOT.innerHTML = '';
  ROOT.appendChild(
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'pill', text: `База: ${totalQuestions} въпроса` }),
        el('span', { class: 'pill', text: `Сесия: ${SESSION_SIZE} въпроса` }),
      ]),
      el('p', { class: 'q', text: 'Готов ли си? Ще получиш 30 случайни въпроса. След всеки отговор ще видиш дали е верен + кратко обяснение.' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'primary', text: 'Старт', onClick: onStart }),
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
      disabled: answered ? 'true' : null,
      onClick: () => {
        if (answered) return;
        state.answerCurrent(letter);
      }
    }, [
      el('span', { class: 'label', text: `${letter}.` }),
      el('span', { text })
    ]);

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
  ROOT.appendChild(
    el('div', { class: 'card results' }, [
      el('h2', { text: `Резултат: ${correct} / ${total} (${pct}%)` }),
      el('p', { class: 'sub', text: `Грешни: ${wrong.length}.` }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'primary', text: 'Нова сесия', onClick: () => state.reset() }),
      ]),
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

async function loadQuestions() {
  const res = await fetch('./data/questions.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Safety: only keep questions with 4 choices
  return data.filter(q => q && q.question && q.choices && q.choices['А'] && q.choices['Б'] && q.choices['В'] && q.choices['Г']);
}

function createState(allQuestions) {
  const state = {
    allQuestions,
    session: [],
    idx: 0,
    answers: {},
    correctCount: 0,
    mode: 'intro', // intro | quiz | results

    start() {
      this.session = sample(this.allQuestions, Math.min(SESSION_SIZE, this.allQuestions.length));
      this.idx = 0;
      this.answers = {};
      this.correctCount = 0;
      this.mode = 'quiz';
      renderQuestion(this);
    },

    answerCurrent(letter) {
      const q = this.session[this.idx];
      this.answers[q.id] = { selected: letter };
      if (letter === q.answer) this.correctCount += 1;
      renderQuestion(this);
    },

    next() {
      if (this.idx >= this.session.length - 1) {
        this.mode = 'results';
        renderResults(this);
        return;
      }
      this.idx += 1;
      renderQuestion(this);
    },

    reset() {
      this.mode = 'intro';
      renderIntro({ totalQuestions: this.allQuestions.length, onStart: () => this.start() });
    },
  };
  return state;
}

(async function main() {
  try {
    renderLoading();
    const questions = await loadQuestions();
    const state = createState(questions);
    renderIntro({ totalQuestions: questions.length, onStart: () => state.start() });
  } catch (err) {
    renderError(err);
  }
})();
