/* quiz.js — NEET Biology Quiz Engine */
'use strict';

import { getSession, loginWithGoogle } from './auth.js?v=1784613352897';
import { checkout, showPremiumModal } from './payment.js?v=1784613352897';
import { topicFor, analyze } from './feedback.js?v=1784613352897';

let session = null;
let userState = null;

// ── State ─────────────────────────────────────────────────────
const state = {
  allQuestions: [],
  quizQuestions: [],
  currentIndex: 0,
  answers: [],          // { questionId, selected, correct, skipped, timeTaken }
  settings: {
    count: 10,
    yearRange: 'all',
    difficulty: 'all',
    subject: 'all',
    timerOn: true,
    lang: 'en',
  },
  timerInterval: null,
  timerSecondsLeft: 90,
};

// ── DOM refs ───────────────────────────────────────────────────
const screens = {
  setup:   document.getElementById('screen-setup'),
  quiz:    document.getElementById('screen-quiz'),
  results: document.getElementById('screen-results'),
};

// Setup
const chipGroups = {
  count:   document.getElementById('q-count'),
  year:    document.getElementById('year-filter'),
  diff:    document.getElementById('diff-filter'),
  subject: document.getElementById('subject-filter'),
  timer:   document.getElementById('timer-toggle'),
  lang:    document.getElementById('lang-toggle'),
};
const btnStart  = document.getElementById('btn-start');
const statTotal = document.getElementById('stat-total');
const statYears = document.getElementById('stat-years');

// Quiz
const progressFill  = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const progressWrap  = document.querySelector('.progress-wrap');
const timerBadge    = document.getElementById('timer-badge');
const timerDisplay  = document.getElementById('timer-display');
const qYearBadge    = document.getElementById('q-year-badge');
const qTypeBadge    = document.getElementById('q-type-badge');
const qDiffBadge    = document.getElementById('q-diff-badge');
const questionText  = document.getElementById('question-text');
const optionsGrid   = document.getElementById('options-grid');
const btnSkip       = document.getElementById('btn-skip');
const btnNext       = document.getElementById('btn-next');

// Results
const scoreNum      = document.getElementById('score-num');
const scoreDenom    = document.getElementById('score-denom');
const scoreRingFill = document.getElementById('score-ring-fill');
const resCorrect    = document.getElementById('res-correct');
const resWrong      = document.getElementById('res-wrong');
const resSkipped    = document.getElementById('res-skipped');
const resAccuracy   = document.getElementById('res-accuracy');
const subjectChart  = document.getElementById('subject-chart');
const yearChart     = document.getElementById('year-chart');
const weakList      = document.getElementById('weak-list');
const recoList      = document.getElementById('reco-list');
const reviewList    = document.getElementById('review-list');
const btnRetry      = document.getElementById('btn-retry');
const btnNewQuiz    = document.getElementById('btn-new-quiz');

// ── Init ───────────────────────────────────────────────────────
export async function init() {
  session = await getSession();
  if (session) {
    try {
      const res = await fetch('/api/user/me', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (res.ok) userState = await res.json();
    } catch (e) {}
  }
  if (typeof QUIZ_DATA === 'undefined' || QUIZ_DATA.length === 0) {
    alert('Quiz data not found! Make sure quiz-data.js is loaded.');
    return;
  }
  state.allQuestions = QUIZ_DATA;
  enforceFreeTierDefaults();
  updateStatPills();
  wireChipGroups();
  btnStart.addEventListener('click', startQuiz);
  btnSkip.addEventListener('click', skipQuestion);
  btnNext.addEventListener('click', nextQuestion);
  btnRetry.addEventListener('click', retryQuiz);
  btnNewQuiz.addEventListener('click', newQuiz);
}

// ── Tier helpers ────────────────────────────────────────────────
// No session and free tier are treated identically: both get the same caps.
// Only an authenticated 'plus'/'pro' subscription unlocks the extras below.
function currentTier() {
  return userState?.tier || 'free';
}

const FREE_MAX_QUESTIONS = 20;

// Free tier is Easy-only and capped at 20 questions. Force those defaults on
// load so a user who never touches a chip can't slip through on the page's
// original defaults (diff defaults to "all", count higher tiers might set).
function enforceFreeTierDefaults() {
  if (currentTier() !== 'free') return;

  state.settings.difficulty = 'Easy';
  chipGroups.diff.querySelectorAll('.quiz-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.value === 'Easy'));

  if (state.settings.count > FREE_MAX_QUESTIONS) state.settings.count = 10;
  chipGroups.count.querySelectorAll('.quiz-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.value === String(state.settings.count)));
}

// ── Stat pills on setup screen ─────────────────────────────────
function updateStatPills() {
  const filtered = getFilteredQuestions();
  statTotal.textContent = filtered.length;
  const years = new Set(filtered.map(q => q.year));
  statYears.textContent = years.size;
}

// ── Chip group wiring ──────────────────────────────────────────
function wireChipGroups() {
  for (const [key, group] of Object.entries(chipGroups)) {
    group.querySelectorAll('.quiz-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.value;

        // Tier enforcement for difficulty — free tier is Easy-only. "All" mixes
        // in Medium/Hard, so it's gated the same as picking Medium/Hard directly.
        if (key === 'diff' && val !== 'Easy') {
          if (!userState) {
            showPremiumModal('Login Required', 'Please log in to access more difficulty options.', 'Log In', () => loginWithGoogle());
            return;
          }
          if (userState.tier === 'free') {
            showPremiumModal('Plus / Pro Required', '"All", Medium, and Hard questions are available exclusively on the Plus and Pro tiers. Free tier is Easy-only.', 'Upgrade Now', () => checkout('plus'));
            return;
          }
        }

        // Tier enforcement for question count — free tier capped at 20/quiz.
        if (key === 'count' && parseInt(val) > FREE_MAX_QUESTIONS) {
          if (!userState) {
            showPremiumModal('Login Required', 'Please log in to unlock longer quizzes.', 'Log In', () => loginWithGoogle());
            return;
          }
          if (userState.tier === 'free') {
            showPremiumModal('Plus / Pro Required', 'Quizzes longer than 20 questions are available on the Plus and Pro tiers.', 'Upgrade Now', () => checkout('plus'));
            return;
          }
        }

        group.querySelectorAll('.quiz-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (key === 'count')   state.settings.count      = parseInt(val);
        if (key === 'year')    state.settings.yearRange  = val;
        if (key === 'diff')    state.settings.difficulty = val;
        if (key === 'subject') state.settings.subject    = val;
        if (key === 'timer')   state.settings.timerOn    = val === 'on';
        if (key === 'lang')    state.settings.lang       = val;
        updateStatPills();
      });
    });
  }
}

// ── Difficulty heuristic (all DB questions stored as 'Medium' placeholder) ──
// Thresholds derived from actual text-length percentiles across all 554 questions:
//   p50 = 82 chars  → Easy/Medium boundary
//   p75 = 141 chars → Medium/Hard boundary
// Special flags (statement_based, match_the_following, assertion_reason) → always Hard
// Resulting distribution: ~43% Easy / ~22% Medium / ~35% Hard
function computeDifficulty(q) {
  const m = q.question_metadata || {};
  if (m.assertion_reason || m.match_the_following) return 'Hard';
  if (m.statement_based) return 'Hard';
  if (q.question.text.length > 141) return 'Hard';
  if (q.question.text.length <= 82) return 'Easy';
  return 'Medium';
}

// ── Filtering ──────────────────────────────────────────────────
function getFilteredQuestions() {
  return state.allQuestions.filter(q => {
    // Subject filter — 'all' means no subject constraint
    if (state.settings.subject !== 'all') {
      if (q.subject !== state.settings.subject) return false;
    }
    // Year filter
    if (state.settings.yearRange !== 'all') {
      const [from, to] = state.settings.yearRange.split('-').map(Number);
      if (q.year < from || q.year > to) return false;
    }
    // Difficulty filter — use computed difficulty, not stored placeholder
    if (state.settings.difficulty !== 'all') {
      if (computeDifficulty(q) !== state.settings.difficulty) return false;
    }
    return true;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Fetch due topics ───────────────────────────────────────────
async function fetchDueTopics() {
  // Signed-in users read their spaced-repetition schedule from the server;
  // anonymous users fall back to a local-only schedule in localStorage.
  if (!session) {
    const local = JSON.parse(localStorage.getItem('anatomy101_progress') || '[]');
    const now = new Date().getTime();
    return new Set(local.filter(d => new Date(d.next_review_date).getTime() <= now).map(d => d.topic));
  }
  try {
    const res = await fetch('/api/progress', {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    const now = new Date().getTime();
    // Return topics whose next_review_date is in the past
    return new Set(data.filter(d => new Date(d.next_review_date).getTime() <= now).map(d => d.topic));
  } catch (e) {
    return new Set();
  }
}

// ── Start quiz ─────────────────────────────────────────────────
async function startQuiz() {
  if (!session) {
    showPremiumModal('Login Required', 'You must be logged in to take quizzes. This helps us track your progress.', 'Log In', () => loginWithGoogle());
    return;
  }

  const pool = getFilteredQuestions();
  if (pool.length === 0) {
    alert('No questions match your filters. Try different settings.');
    return;
  }

  // Server-side weekly-quota + tier gate. This is the real limit; the client
  // never bypasses it (even locally), so there's no path for a user to skip it.
  const origText = btnStart.textContent;
  btnStart.textContent = 'Checking quota...';
  btnStart.disabled = true;
  try {
    const res = await fetch('/api/quiz/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ difficulty: state.settings.difficulty, count: state.settings.count })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        alert('Your session expired. Please log in again.');
      } else if (res.status === 429) {
        alert(data.message || 'Weekly quiz limit reached. Upgrade to Plus or Pro for more.');
      } else {
        alert('An error occurred. Please try again later.');
      }
      return;
    }
  } catch (err) {
    alert('Failed to connect to server. Check your connection.');
    return;
  } finally {
    btnStart.textContent = origText;
    btnStart.disabled = false;
  }

  await beginSession(pool);
}

// ── Build the question set (spaced-repetition biased) and start ──
// Spaced repetition (biasing toward due-for-review topics) is a Plus/Pro
// feature; free tier always gets a plain random draw from the filtered pool.
async function beginSession(pool) {
  const tier = currentTier();
  const srEnabled = tier === 'plus' || tier === 'pro';
  const dueTopics = srEnabled ? await fetchDueTopics() : new Set();
  let selected;
  if (dueTopics.size > 0) {
    // Spaced repetition: front-load topics that are due for review, filling up
    // to ~70% of the session with them, then top up from everything else.
    const priority = pool.filter(q => dueTopics.has(topicFor(q).topic));
    const standard = pool.filter(q => !dueTopics.has(topicFor(q).topic));

    const priorityCount = Math.min(priority.length, Math.ceil(state.settings.count * 0.7));
    selected = shuffle(priority).slice(0, priorityCount);

    const remCount = state.settings.count - selected.length;
    selected = shuffle([...selected, ...shuffle(standard).slice(0, remCount)]);
  } else {
    selected = shuffle(pool).slice(0, state.settings.count);
  }

  const count = Math.min(state.settings.count, selected.length);
  state.quizQuestions = selected.slice(0, count);
  state.currentIndex  = 0;
  state.answers       = [];

  showScreen('quiz');
  timerBadge.classList.toggle('hidden', !state.settings.timerOn);

  renderQuestion();
}

// ── Question rendering ─────────────────────────────────────────
function renderQuestion() {
  const q = state.quizQuestions[state.currentIndex];
  const total = state.quizQuestions.length;
  const idx   = state.currentIndex;

  // Progress
  const pct = (idx / total) * 100;
  progressFill.style.width = pct + '%';
  progressLabel.textContent = `${idx + 1} / ${total}`;
  progressWrap.setAttribute('aria-valuenow', Math.round(pct));

  // Badges — use computed difficulty
  qYearBadge.textContent = q.year;
  qTypeBadge.textContent = q.question_metadata?.type || 'Conceptual';
  const diff = computeDifficulty(q);
  qDiffBadge.textContent = diff;
  qDiffBadge.dataset.diff = diff;

  // Question text
  const isHi = state.settings.lang === 'hi';
  questionText.textContent = isHi && q.question.text_hi ? q.question.text_hi : q.question.text;

  // Options
  optionsGrid.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    
    const optText = isHi && opt.text_hi ? opt.text_hi : opt.text;
    btn.setAttribute('aria-label', `Option ${opt.id}: ${optText}`);
    btn.dataset.id = opt.id;
    btn.innerHTML = `<span class="opt-letter">${opt.id}</span><span>${escapeHtml(optText)}</span>`;
    btn.addEventListener('click', () => selectOption(opt.id));
    optionsGrid.appendChild(btn);
  });

  btnNext.disabled = true;
  state.qStartTime = performance.now();

  // Timer
  if (state.settings.timerOn) startTimer();
}

function elapsedSeconds() {
  return state.qStartTime ? (performance.now() - state.qStartTime) / 1000 : null;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Option selection ───────────────────────────────────────────
function selectOption(selectedId) {
  // Prevent re-selection
  if (btnNext.disabled === false) return;

  const q = state.quizQuestions[state.currentIndex];
  const correctId = q.answer.correct;
  const isCorrect = selectedId === correctId;

  stopTimer();

  // Style all buttons
  optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const id = btn.dataset.id;
    if (id === correctId) {
      btn.classList.add('correct');
      btn.setAttribute('aria-checked', id === selectedId ? 'true' : 'false');
    } else if (id === selectedId && !isCorrect) {
      btn.classList.add('wrong');
      btn.setAttribute('aria-checked', 'true');
    }
  });

  // Record answer
  state.answers.push({
    questionId: q.id,
    question:   q,
    selected:   selectedId,
    correct:    correctId,
    isCorrect,
    skipped:    false,
    timeTaken:  elapsedSeconds(),
  });

  btnNext.disabled = false;
}

// ── Skip ───────────────────────────────────────────────────────
function skipQuestion() {
  stopTimer();
  const q = state.quizQuestions[state.currentIndex];
  state.answers.push({
    questionId: q.id,
    question:   q,
    selected:   null,
    correct:    q.answer.correct,
    isCorrect:  false,
    skipped:    true,
    timeTaken:  elapsedSeconds(),
  });
  advance();
}

// ── Next ───────────────────────────────────────────────────────
function nextQuestion() { advance(); }

function advance() {
  state.currentIndex++;
  if (state.currentIndex >= state.quizQuestions.length) {
    showResults();
  } else {
    renderQuestion();
  }
}

// ── Timer ──────────────────────────────────────────────────────
function startTimer() {
  state.timerSecondsLeft = 90;
  timerBadge.classList.remove('warning', 'danger');
  updateTimerDisplay();
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timerSecondsLeft--;
    updateTimerDisplay();
    if (state.timerSecondsLeft <= 10) timerBadge.classList.add('danger');
    else if (state.timerSecondsLeft <= 30) { timerBadge.classList.remove('danger'); timerBadge.classList.add('warning'); }
    if (state.timerSecondsLeft <= 0) { stopTimer(); skipQuestion(); }
  }, 1000);
}

function stopTimer() { clearInterval(state.timerInterval); state.timerInterval = null; }

function updateTimerDisplay() {
  const m = Math.floor(state.timerSecondsLeft / 60);
  const s = state.timerSecondsLeft % 60;
  timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Results ────────────────────────────────────────────────────
function showResults() {
  stopTimer();
  progressFill.style.width = '100%';

  const total   = state.answers.length;
  const correct = state.answers.filter(a => a.isCorrect).length;
  const wrong   = state.answers.filter(a => !a.isCorrect && !a.skipped).length;
  const skipped = state.answers.filter(a => a.skipped).length;

  // NEET +4/-1 scoring
  const neetScore = (correct * 4) - (wrong * 1);
  const maxScore  = total * 4;
  const accuracy  = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Score ring
  const circumference = 327;
  const offset = circumference - (accuracy / 100) * circumference;
  setTimeout(() => { scoreRingFill.style.strokeDashoffset = offset; }, 100);

  if (accuracy >= 70) scoreRingFill.style.stroke = 'var(--green)';
  else if (accuracy >= 40) scoreRingFill.style.stroke = 'var(--amber)';
  else scoreRingFill.style.stroke = 'var(--red)';

  scoreNum.textContent    = neetScore;
  scoreDenom.textContent  = `/ ${maxScore}`;
  resCorrect.textContent  = correct;
  resWrong.textContent    = wrong;
  resSkipped.textContent  = skipped;
  resAccuracy.textContent = accuracy + '%';

  // Run the feedback engine once and feed every results section from it.
  // analyze() expects `correct` as a boolean, so map isCorrect → correct.
  const analysis = analyze(
    state.answers.map(a => ({
      questionId: a.questionId,
      selected:   a.selected,
      correct:    a.isCorrect,
      skipped:    a.skipped,
      timeTaken:  a.timeTaken,
    })),
    state.quizQuestions,
  );
  state._analysis = analysis;

  buildSubjectBreakdown(analysis);
  buildTopicBreakdown(analysis);
  buildYearChart();
  buildRecoList(analysis);
  buildReviewList();
  showScreen('results');

  // Submit to progress API
  const resultsPayload = state.answers.map(a => {
    const { topic } = topicFor(a.question);
    return { topic, isCorrect: !!(a.isCorrect && !a.skipped) };
  });

  if (session) {
    fetch('/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ results: resultsPayload })
    }).catch(console.error);
  } else {
    const local = JSON.parse(localStorage.getItem('anatomy101_progress') || '[]');
    resultsPayload.forEach(res => {
      let entry = local.find(x => x.topic === res.topic);
      if (!entry) { entry = { topic: res.topic, level: 0 }; local.push(entry); }
      if (res.isCorrect) { entry.level++; } else { entry.level = Math.max(0, entry.level - 1); }
      const days = Math.pow(2, entry.level);
      const d = new Date(); d.setDate(d.getDate() + days);
      entry.next_review_date = d.toISOString();
    });
    localStorage.setItem('anatomy101_progress', JSON.stringify(local));
  }
}

// ── Subject breakdown ──────────────────────────────────────────
const SUBJECT_ORDER = ['Biology', 'Physics', 'Chemistry'];

function buildSubjectBreakdown(analysis) {
  const bySubject = analysis.bySubject || {};
  const subjects = Object.keys(bySubject).sort((a, b) => {
    const ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });

  subjectChart.innerHTML = '';
  if (subjects.length === 0) { subjectChart.innerHTML = '<p class="empty-state">No data.</p>'; return; }

  for (const s of subjects) {
    const { correct, total, pct } = bySubject[s];
    const cls = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${escapeHtml(s)}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="bar-pct">${correct}/${total} · ${pct}%</span>`;
    subjectChart.appendChild(row);
  }
}

// ── Topic breakdown (weak areas) — fed from analyze().byTopic ───
function buildTopicBreakdown(analysis) {
  const items = analysis.byTopic || []; // already sorted worst-first

  weakList.innerHTML = '';
  if (items.length === 0) { weakList.innerHTML = '<p class="empty-state">No data to show.</p>'; return; }

  for (const item of items) {
    const severity = item.pct < 40 ? 'high' : item.pct < 70 ? 'medium' : 'low';
    const label    = item.pct < 40 ? 'Needs Work' : item.pct < 70 ? 'Average' : 'Strong';
    const bar = Math.round(item.pct);
    const barCls = item.pct >= 70 ? 'high' : item.pct >= 40 ? 'medium' : 'low';

    const div = document.createElement('div');
    div.className = `weak-item severity-${severity}`;
    div.innerHTML = `
      <div class="weak-item-top">
        <div class="weak-info">
          <div class="weak-name">${escapeHtml(item.topic)}</div>
          <div class="weak-ncert">${escapeHtml(item.subject)}</div>
        </div>
        <span class="weak-badge">${label}</span>
      </div>
      <div class="weak-bar-row">
        <div class="bar-track flex-bar">
          <div class="bar-fill ${barCls}" style="width:${bar}%"></div>
        </div>
        <span class="bar-pct">${item.correct}/${item.total}</span>
      </div>`;
    weakList.appendChild(div);
  }
}

// ── Year chart ─────────────────────────────────────────────────
function buildYearChart() {
  const byYear = {};
  for (const a of state.answers) {
    const yr = a.question.year;
    if (!byYear[yr]) byYear[yr] = { correct: 0, total: 0 };
    byYear[yr].total++;
    if (a.isCorrect) byYear[yr].correct++;
  }
  yearChart.innerHTML = '';
  const years = Object.keys(byYear).sort();
  if (years.length === 0) { yearChart.innerHTML = '<p class="empty-state">No data.</p>'; return; }
  for (const yr of years) {
    const { correct, total } = byYear[yr];
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const cls = pct >= 70 ? 'high' : pct >= 40 ? 'medium' : 'low';
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${yr}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="bar-pct">${pct}%</span>`;
    yearChart.appendChild(row);
  }
}

// ── Recommendations — fed from analyze().recommendations ───────
function buildRecoList(analysis) {
  const recos = [];
  const answers = state.answers;
  const total   = answers.length;
  const correct = answers.filter(a => a.isCorrect).length;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;

  // Overall performance
  if (accuracy < 40) {
    recos.push({
      priority: 'critical',
      title: 'Foundation needs rebuilding',
      body: 'Below 40% accuracy. Start by re-reading <strong>NCERT Class 11 & 12</strong> cover to cover — majority of NEET questions are lifted verbatim or closely paraphrased from NCERT.',
    });
  } else if (accuracy < 70) {
    recos.push({
      priority: 'high',
      title: 'Strengthen weak topics',
      body: 'Good base — but 40–70% accuracy won\'t secure a NEET seat. Focus on the weak topics below and make <strong>flashcard notes</strong> for every fact you miss.',
    });
  } else {
    recos.push({
      priority: 'low',
      title: 'Excellent! Now aim for 90%+',
      body: 'Strong performance. Focus on <strong>edge cases, exceptions, and numerical questions</strong>. Work through official NTA previous papers from 2022 onwards.',
    });
  }

  // Topic-specific recommendations from the feedback engine.
  // Weak-area recos come first (see analyze()); colour them by urgency.
  for (const r of (analysis.recommendations || [])) {
    const isWeak = r.reason.startsWith('Weak area');
    recos.push({
      priority: isWeak ? 'high' : 'medium',
      title: `Revise: ${r.topic}`,
      body: `<strong>${escapeHtml(r.subject)}</strong> — ${escapeHtml(r.reason)}`,
    });
  }

  // Statement questions
  const statQ = answers.filter(a => a.question.question_metadata?.statement_based);
  const statAcc = statQ.length > 0 ? statQ.filter(a => a.isCorrect).length / statQ.length * 100 : 100;
  if (statQ.length >= 2 && statAcc < 60) {
    recos.push({
      priority: 'high',
      title: 'Strategy: Statement-based questions',
      body: `Only ${Math.round(statAcc)}% on statement questions (${statQ.filter(a => a.isCorrect).length}/${statQ.length}). Use the <strong>elimination method</strong>: evaluate each statement independently, eliminate options with false statements. Never guess on all-correct options.`,
    });
  }

  // Match-the-following
  const matchQ = answers.filter(a => a.question.question_metadata?.match_the_following);
  const matchAcc = matchQ.length > 0 ? matchQ.filter(a => a.isCorrect).length / matchQ.length * 100 : 100;
  if (matchQ.length >= 2 && matchAcc < 60) {
    recos.push({
      priority: 'medium',
      title: 'Strategy: Match-the-Following',
      body: `Only ${Math.round(matchAcc)}% on matching questions. Use <strong>anchor matching</strong> — identify the pair you are 100% sure of first, then use process of elimination to narrow the options.`,
    });
  }

  // Skipping
  const skipped = answers.filter(a => a.skipped).length;
  if (skipped > total * 0.15) {
    recos.push({
      priority: 'medium',
      title: 'Reduce skipping — time management',
      body: `You skipped ${skipped}/${total} questions. In NEET, skipping is sometimes right (to avoid -1), but attempt every question you have >50% confidence on. Practise <strong>60-second rule</strong>: if unsure after 60 seconds, mark the best guess and move on.`,
    });
  }

  // Year trend
  const recentQ = answers.filter(a => a.question.year >= 2021);
  const oldQ    = answers.filter(a => a.question.year <= 2018);
  if (recentQ.length >= 3 && oldQ.length >= 3) {
    const recentAcc = recentQ.filter(a => a.isCorrect).length / recentQ.length * 100;
    const oldAcc    = oldQ.filter(a => a.isCorrect).length / oldQ.length * 100;
    if (recentAcc < oldAcc - 20) {
      recos.push({
        priority: 'high',
        title: 'Recent papers are harder for you',
        body: `${Math.round(oldAcc)}% on ≤2018 papers vs ${Math.round(recentAcc)}% on ≥2021 papers. NTA now focuses on <strong>application and reasoning</strong> over recall. Solve NEET 2022, 2023, 2024 papers in full timed conditions.`,
      });
    }
  }

  recoList.innerHTML = '';
  const colours = { critical: 'var(--red)', high: 'var(--amber)', medium: 'var(--brand)', low: 'var(--green)' };
  for (const r of recos) {
    const col = colours[r.priority] || 'var(--brand)';
    const div = document.createElement('div');
    div.className = 'reco-item';
    div.style.setProperty('--reco-color', col);
    div.innerHTML = `
      <div class="reco-accent"></div>
      <div class="reco-body">
        <div class="reco-title">${escapeHtml(r.title)}</div>
        <p class="reco-text">${r.body}</p>
      </div>`;
    recoList.appendChild(div);
  }
}

// ── Review wrong answers ───────────────────────────────────────
function buildReviewList() {
  const bad = state.answers.filter(a => !a.isCorrect);
  reviewList.innerHTML = '';
  if (bad.length === 0) {
    reviewList.innerHTML = '<p class="empty-state">Perfect! No wrong answers to review. 🎉</p>';
    return;
  }
  for (const a of bad) {
    const q = a.question;
    const topic = topicFor(q); // { subject, topic, chapter }
    const selectedOpt = q.options.find(o => o.id === a.selected);
    const correctOpt  = q.options.find(o => o.id === a.correct);
    const div = document.createElement('div');
    div.className = `review-item ${a.skipped ? 'was-skipped' : 'was-wrong'}`;

    const isHi = state.settings.lang === 'hi';
    const qText = isHi && q.question.text_hi ? q.question.text_hi : q.question.text;
    const explSrc = isHi && q.answer.explanation_hi ? q.answer.explanation_hi : q.answer.explanation;
    const expl = explSrc?.trim();

    const getOptText = (opt) => {
      if (!opt) return '—';
      return isHi && opt.text_hi ? escapeHtml(opt.text_hi) : escapeHtml(opt.text);
    };

    div.innerHTML = `
      <div class="review-q-meta">
        <span class="badge badge-year">${q.year}</span>
        <span class="badge badge-topic">${escapeHtml(topic.topic)}</span>
        ${a.skipped ? '<span class="badge badge-skipped">Skipped</span>' : ''}
      </div>
      <p class="review-q-text">${escapeHtml(qText)}</p>
      <div class="review-answers">
        ${a.skipped ? '' : `
          <div class="review-ans-row">
            <span class="review-ans-label">Your answer</span>
            <span class="review-ans-val wrong">${getOptText(selectedOpt)}</span>
          </div>`}
        <div class="review-ans-row">
          <span class="review-ans-label">Correct answer</span>
          <span class="review-ans-val correct">${correctOpt ? `<strong>${correctOpt.id}.</strong> ${getOptText(correctOpt)}` : a.correct}</span>
        </div>
      </div>
      ${expl ? `<div class="review-explanation"><span class="expl-label">Explanation</span>${escapeHtml(expl)}</div>` : ''}
      <div class="review-ncert">📖 Study: ${escapeHtml(topic.chapter)}</div>`;
    reviewList.appendChild(div);
  }
}

// ── Screen transitions ─────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Retry / New quiz ───────────────────────────────────────────
function retryQuiz() {
  state.quizQuestions = shuffle(state.quizQuestions);
  state.currentIndex  = 0;
  state.answers       = [];
  showScreen('quiz');
  renderQuestion();
}

function newQuiz() {
  showScreen('setup');
  updateStatPills();
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

