/* quiz.js — NEET Biology Quiz Engine */
'use strict';

import { getSession, loginWithGoogle } from './auth.js';
import { checkout, showPremiumModal } from './payment.js';

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
    timerOn: true,
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
  count:  document.getElementById('q-count'),
  year:   document.getElementById('year-filter'),
  diff:   document.getElementById('diff-filter'),
  timer:  document.getElementById('timer-toggle'),
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
  updateStatPills();
  wireChipGroups();
  btnStart.addEventListener('click', startQuiz);
  btnSkip.addEventListener('click', skipQuestion);
  btnNext.addEventListener('click', nextQuestion);
  btnRetry.addEventListener('click', retryQuiz);
  btnNewQuiz.addEventListener('click', newQuiz);
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

        // Tier enforcement for difficulty
        if (key === 'diff' && val !== 'Easy' && val !== 'all') {
          if (!userState) {
            showPremiumModal('Login Required', 'Please log in to access Medium and Hard questions.', 'Log In', () => loginWithGoogle());
            return;
          }
          if (userState.tier === 'free') {
            showPremiumModal('Plus / Pro Required', 'Medium and Hard questions are available exclusively on the Plus and Pro tiers.', 'Upgrade Now', () => checkout('plus'));
            return;
          }
        }

        group.querySelectorAll('.quiz-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (key === 'count')  state.settings.count     = parseInt(val);
        if (key === 'year')   state.settings.yearRange  = val;
        if (key === 'diff')   state.settings.difficulty = val;
        if (key === 'timer')  state.settings.timerOn    = val === 'on';
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

  // Server check
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
      body: JSON.stringify({ difficulty: state.settings.difficulty })
    });

    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 401) {
        alert('Your session expired. Please log in again.');
      } else if (res.status === 429) {
        alert(data.message || 'Weekly quiz limit reached. Upgrade to Plus or Pro for more.');
      } else {
        alert('An error occurred. Please try again later.');
      }
      btnStart.textContent = origText;
      btnStart.disabled = false;
      return;
    }
  } catch (err) {
    alert('Failed to connect to server. Check your connection.');
    btnStart.textContent = origText;
    btnStart.disabled = false;
    return;
  }
  
  btnStart.textContent = origText;
  btnStart.disabled = false;
  const count = Math.min(state.settings.count, pool.length);
  state.quizQuestions = shuffle(pool).slice(0, count);
  state.currentIndex  = 0;
  state.answers       = [];

  showScreen('quiz');
  if (!state.settings.timerOn) timerBadge.classList.add('hidden');
  else timerBadge.classList.remove('hidden');

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
  questionText.textContent = q.question.text;

  // Options
  optionsGrid.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', 'false');
    btn.setAttribute('aria-label', `Option ${opt.id}: ${opt.text}`);
    btn.dataset.id = opt.id;
    btn.innerHTML = `<span class="opt-letter">${opt.id}</span><span>${escapeHtml(opt.text)}</span>`;
    btn.addEventListener('click', () => selectOption(opt.id));
    optionsGrid.appendChild(btn);
  });

  btnNext.disabled = true;

  // Timer
  if (state.settings.timerOn) startTimer();
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

// ── Topic Classification Engine ───────────────────────────────
// Maps keywords in question text → NEET Biology topic + NCERT chapter
const TOPIC_MAP = [
  {
    topic: 'Photosynthesis',
    ncert: 'Class 11 Ch.13 – Photosynthesis in Higher Plants',
    keys: ['photosynthesis', 'chlorophyll', 'thylakoid', 'stroma', 'calvin', 'light reaction', 'dark reaction',
           'photorespiration', 'c3', 'c4', 'cam', 'rubisco', 'noncyclic', 'cyclic photophosphorylation',
           'antenna', 'photosystem', 'ps i', 'ps ii', 'z scheme', 'atp synthesis', 'f0f1'],
  },
  {
    topic: 'Respiration',
    ncert: 'Class 11 Ch.14 – Respiration in Plants',
    keys: ['glycolysis', 'krebs cycle', 'tca', 'electron transport', 'oxidative phosphorylation',
           'fermentation', 'atp', 'nadh', 'fadh', 'cytochrome', 'mitochondria', 'anaerobic', 'aerobic',
           'pyruvate', 'acetyl coa', 'substrate level', 'respiratory quotient', 'rq'],
  },
  {
    topic: 'Plant Growth & Hormones',
    ncert: 'Class 11 Ch.15 – Plant Growth and Development',
    keys: ['auxin', 'gibberellin', 'cytokinin', 'abscisic', 'ethylene', 'phytohormone', 'apical dominance',
           'bolting', 'vernalisation', 'photoperiodism', 'senescence', 'dormancy', 'avena', 'iba', 'naa', 'ga3'],
  },
  {
    topic: 'Cell Structure & Organelles',
    ncert: 'Class 11 Ch.8 – Cell: The Unit of Life',
    keys: ['mitochondria', 'chloroplast', 'ribosome', 'golgi', 'endoplasmic reticulum', 'lysosome', 'vacuole',
           'centrosome', 'centriole', 'nucleosome', 'chromatin', 'cell wall', 'plasma membrane',
           'fluid mosaic', 'tonoplast', 'peroxisome', 'glyoxysome', 'microtubule', 'microfilament'],
  },
  {
    topic: 'Cell Division',
    ncert: 'Class 11 Ch.10 – Cell Cycle and Cell Division',
    keys: ['mitosis', 'meiosis', 'prophase', 'metaphase', 'anaphase', 'telophase', 'interphase',
           'synapsis', 'crossing over', 'chiasmata', 'bivalent', 'spindle', 'cytokinesis',
           'leptotene', 'zygotene', 'pachytene', 'diplotene', 'diakinesis', 'checkpoints'],
  },
  {
    topic: 'Biomolecules',
    ncert: 'Class 11 Ch.9 – Biomolecules',
    keys: ['protein', 'carbohydrate', 'lipid', 'nucleic acid', 'amino acid', 'enzyme', 'substrate',
           'active site', 'coenzyme', 'cofactor', 'inhibitor', 'allosteric', 'dna', 'rna',
           'purine', 'pyrimidine', 'adenine', 'guanine', 'thymine', 'uracil', 'cytosine',
           'phosphodiester', 'peptide bond', 'denaturation'],
  },
  {
    topic: 'Genetics & Heredity',
    ncert: 'Class 12 Ch.5 – Principles of Inheritance and Variation',
    keys: ['mendel', 'dominance', 'recessiv', 'codominance', 'incomplete dominance', 'dihybrid',
           'monohybrid', 'genotype', 'phenotype', 'allele', 'heterozygous', 'homozygous',
           'sex-linked', 'haemophilia', 'colour blind', 'pedigree', 'test cross', 'back cross',
           'polygenic', 'pleiotropy', 'epistasis', 'linkage', 'mutation'],
  },
  {
    topic: 'Molecular Biology & DNA',
    ncert: 'Class 12 Ch.6 – Molecular Basis of Inheritance',
    keys: ['replication', 'transcription', 'translation', 'mrna', 'trna', 'rrna', 'codon', 'anticodon',
           'operon', 'lac operon', 'trp operon', 'promoter', 'repressor', 'chromosome', 'karyotype',
           'okazaki', 'helicase', 'polymerase', 'ligase', 'pcr', 'recombinant dna', 'restriction enzyme',
           'plasmid', 'vector', 'gel electrophoresis', 'southern blot'],
  },
  {
    topic: 'Human Physiology – Digestion',
    ncert: 'Class 11 Ch.16 – Digestion and Absorption',
    keys: ['digestion', 'stomach', 'intestine', 'duodenum', 'jejunum', 'ileum', 'colon', 'rectum',
           'pepsin', 'trypsin', 'amylase', 'lipase', 'bile', 'peristalsis', 'absorption',
           'villus', 'villi', 'chyme', 'chylomicron', 'lacteals'],
  },
  {
    topic: 'Human Physiology – Respiration',
    ncert: 'Class 11 Ch.17 – Breathing and Exchange of Gases',
    keys: ['lung', 'trachea', 'bronchus', 'alveoli', 'diaphragm', 'breathing', 'tidal volume',
           'vital capacity', 'residual volume', 'haemoglobin', 'oxygen dissociation', 'bohr effect',
           'co2 transport', 'bicarbonate', 'asthma', 'emphysema'],
  },
  {
    topic: 'Human Physiology – Circulation',
    ncert: 'Class 11 Ch.18 – Body Fluids and Circulation',
    keys: ['heart', 'blood', 'artery', 'vein', 'capillary', 'cardiac cycle', 'systole', 'diastole',
           'ecg', 'blood pressure', 'pulse', 'lymph', 'plasma', 'rbc', 'wbc', 'platelet',
           'coagulation', 'fibrin', 'thrombin', 'abo', 'rh factor', 'pacemaker', 'av node', 'sa node'],
  },
  {
    topic: 'Human Physiology – Excretion',
    ncert: 'Class 11 Ch.19 – Excretory Products and their Elimination',
    keys: ['kidney', 'nephron', 'glomerulus', 'bowman', 'urea', 'uric acid', 'filtration',
           'reabsorption', 'secretion', 'loop of henle', 'pct', 'dct', 'collecting duct',
           'juxtaglomerular', 'adh', 'aldosterone', 'dialysis', 'micturition'],
  },
  {
    topic: 'Human Physiology – Neural Control',
    ncert: 'Class 11 Ch.21 – Neural Control and Coordination',
    keys: ['neuron', 'nerve', 'brain', 'spinal cord', 'synapse', 'neurotransmitter', 'acetylcholine',
           'action potential', 'resting potential', 'reflex', 'cerebrum', 'cerebellum', 'medulla',
           'hypothalamus', 'thalamus', 'dendrite', 'axon', 'myelinated', 'saltatory conduction'],
  },
  {
    topic: 'Human Physiology – Endocrinology',
    ncert: 'Class 11 Ch.22 – Chemical Coordination and Integration',
    keys: ['hormone', 'pituitary', 'thyroid', 'adrenal', 'pancreas', 'insulin', 'glucagon',
           'thyroxine', 'adrenaline', 'cortisol', 'testosterone', 'oestrogen', 'progesterone',
           'fsh', 'lh', 'gh', 'tsh', 'acth', 'oxytocin', 'vasopressin', 'melatonin', 'serotonin',
           'diabetes', 'goitre', 'feedback'],
  },
  {
    topic: 'Human Physiology – Locomotion',
    ncert: 'Class 11 Ch.20 – Locomotion and Movement',
    keys: ['muscle', 'sarcomere', 'actin', 'myosin', 'sliding filament', 'troponin', 'tropomyosin',
           'bone', 'joint', 'tendon', 'ligament', 'skeletal', 'smooth muscle', 'cardiac muscle',
           'tetanus', 'fatigue', 'tonus', 'spasm', 'osteoporosis', 'arthritis'],
  },
  {
    topic: 'Reproduction in Plants',
    ncert: 'Class 12 Ch.2 – Sexual Reproduction in Flowering Plants',
    keys: ['pollination', 'fertilization', 'pollen', 'ovule', 'seed', 'fruit', 'flower',
           'stamen', 'pistil', 'anther', 'stigma', 'style', 'ovary', 'calyx', 'corolla',
           'tapetum', 'sporopollenin', 'gametophyte', 'sporophyte', 'double fertilization',
           'endosperm', 'embryo', 'germination'],
  },
  {
    topic: 'Human Reproduction',
    ncert: 'Class 12 Ch.3 – Human Reproduction',
    keys: ['spermatogenesis', 'oogenesis', 'sperm', 'ovum', 'follicle', 'ovulation', 'menstrual',
           'uterus', 'fallopian', 'placenta', 'implantation', 'embryogenesis', 'foetus',
           'amniocentesis', 'sertoli', 'leydig', 'testosterone', 'gnrh', 'inhibin'],
  },
  {
    topic: 'Reproductive Health & Contraception',
    ncert: 'Class 12 Ch.4 – Reproductive Health',
    keys: ['contraception', 'iud', 'vasectomy', 'tubectomy', 'barrier', 'condom', 'oral pill',
           'stds', 'hiv', 'aids', 'mtp', 'amniocentesis', 'ivf', 'zift', 'gift', 'infertility',
           'artificial insemination'],
  },
  {
    topic: 'Evolution',
    ncert: 'Class 12 Ch.7 – Evolution',
    keys: ['darwin', 'natural selection', 'evolution', 'homologous', 'analogous', 'fossils',
           'vestigial', 'convergent', 'divergent', 'adaptive radiation', 'hardy weinberg',
           'genetic drift', 'gene flow', 'mutation pressure', 'species', 'speciation',
           'isolation', 'lamarck'],
  },
  {
    topic: 'Human Health & Disease',
    ncert: 'Class 12 Ch.8 – Human Health and Disease',
    keys: ['immunity', 'antibody', 'antigen', 'vaccine', 'b cell', 't cell', 'lymphocyte',
           'malaria', 'typhoid', 'pneumonia', 'cancer', 'tumour', 'metastasis', 'drugs',
           'addiction', 'passive immunity', 'active immunity', 'autoimmune', 'allergy'],
  },
  {
    topic: 'Microbes & Biotechnology Applications',
    ncert: 'Class 12 Ch.10 – Microbes in Human Welfare',
    keys: ['bacteria', 'virus', 'fungi', 'biogas', 'fermentation', 'sewage treatment',
           'biofertilizer', 'rhizobium', 'mycorrhiza', 'antibiotics', 'penicillin', 'yeast',
           'biocontrol', 'baculovirus', 'trichoderma'],
  },
  {
    topic: 'Biotechnology',
    ncert: 'Class 12 Ch.11 – Biotechnology: Principles and Processes',
    keys: ['recombinant dna', 'restriction enzyme', 'ligase', 'plasmid', 'vector', 'gel electrophoresis',
           'pcr', 'polymerase chain reaction', 'cloning', 'southern blot', 'dna fingerprinting',
           'insulin production', 'bt cotton', 'golden rice', 'stem cell', 'gene therapy'],
  },
  {
    topic: 'Ecology & Environment',
    ncert: 'Class 12 Ch.13 – Organisms and Populations / Ch.14 – Ecosystem',
    keys: ['ecosystem', 'food chain', 'food web', 'trophic level', 'energy flow', 'decomposer',
           'producer', 'consumer', 'biomass', 'productivity', 'population', 'natality', 'mortality',
           'carrying capacity', 'logistic', 'gause', 'competition', 'predation', 'parasitism',
           'mutualism', 'commensalism'],
  },
  {
    topic: 'Biodiversity & Conservation',
    ncert: 'Class 12 Ch.15 – Biodiversity and Conservation',
    keys: ['biodiversity', 'species richness', 'endemic', 'hotspot', 'extinction', 'iucn',
           'red list', 'national park', 'sanctuary', 'biosphere reserve', 'in situ', 'ex situ',
           'cites', 'biodiversity loss', 'deforestation', 'joint forest management'],
  },
  {
    topic: 'Structural Organisation (Plant & Animal)',
    ncert: 'Class 11 Ch.5–6 – Morphology & Anatomy of Flowering Plants / Animal Tissues',
    keys: ['tissue', 'meristem', 'parenchyma', 'collenchyma', 'sclerenchyma', 'xylem', 'phloem',
           'epidermis', 'cortex', 'pith', 'epithelium', 'connective tissue', 'muscle tissue',
           'nervous tissue', 'root', 'shoot', 'leaf modification', 'stem modification'],
  },
  {
    topic: 'Biological Classification',
    ncert: 'Class 11 Ch.2 – Biological Classification',
    keys: ['kingdom', 'monera', 'protista', 'fungi', 'plantae', 'animalia', 'archaebacteria',
           'eubacteria', 'cyanobacteria', 'virus', 'viroid', 'lichen', 'algae', 'bryophyte',
           'pteridophyte', 'gymnosperm', 'angiosperm', 'nomenclature', 'binomial', 'taxonomy'],
  },
  {
    topic: 'Animal Kingdom',
    ncert: 'Class 11 Ch.4 – Animal Kingdom',
    keys: ['porifera', 'cnidaria', 'platyhelminthes', 'nematoda', 'annelida', 'mollusca', 'arthropoda',
           'echinodermata', 'chordata', 'vertebrate', 'invertebrate', 'coelom', 'symmetry',
           'notochord', 'mammalia', 'aves', 'reptilia', 'amphibia', 'pisces', 'periplaneta'],
  },
];

// Classify a question to its NEET topic
function classifyQuestion(q) {
  const txt = (q.question.text + ' ' + q.options.map(o => o.text).join(' ')).toLowerCase();
  for (const t of TOPIC_MAP) {
    if (t.keys.some(k => txt.includes(k))) return t;
  }
  return { topic: 'General Biology', ncert: 'Review NCERT Class 11 & 12 thoroughly' };
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

  buildTopicBreakdown();
  buildYearChart();
  buildRecoList();
  buildReviewList();
  showScreen('results');
}

// ── Topic Breakdown (replaces old weak list) ───────────────────
function buildTopicBreakdown() {
  // Classify every answered question
  const byTopic = {};
  for (const a of state.answers) {
    const classification = classifyQuestion(a.question);
    const key = classification.topic;
    if (!byTopic[key]) byTopic[key] = { ncert: classification.ncert, correct: 0, total: 0, wrongQs: [] };
    byTopic[key].total++;
    if (a.isCorrect) byTopic[key].correct++;
    else if (!a.skipped) byTopic[key].wrongQs.push(a);
  }

  const items = Object.entries(byTopic).map(([topic, data]) => ({
    topic,
    ncert: data.ncert,
    correct: data.correct,
    total: data.total,
    wrongQs: data.wrongQs,
    pct: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct);

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
          <div class="weak-ncert">${escapeHtml(item.ncert)}</div>
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

  // Store for reco engine
  state._topicData = items;
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

// ── Recommendations ────────────────────────────────────────────
function buildRecoList() {
  const recos = [];
  const answers = state.answers;
  const total   = answers.length;
  const correct = answers.filter(a => a.isCorrect).length;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  const topics = state._topicData || [];

  // Overall performance
  if (accuracy < 40) {
    recos.push({
      priority: 'critical',
      title: 'Foundation needs rebuilding',
      body: 'Below 40% accuracy. Start by re-reading <strong>NCERT Class 11 & 12 Biology</strong> cover to cover — majority of NEET questions are lifted verbatim or closely paraphrased from NCERT.',
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

  // Specific weak topics from classification
  const weakTopics = topics.filter(t => t.pct < 50 && t.total >= 2);
  if (weakTopics.length > 0) {
    for (const t of weakTopics.slice(0, 3)) {
      recos.push({
        priority: t.pct < 30 ? 'critical' : 'high',
        title: `Revise: ${t.topic}`,
        body: `Scored <strong>${t.pct}%</strong> (${t.correct}/${t.total} correct). Open <strong>${escapeHtml(t.ncert)}</strong> and re-read it completely. Make a one-page summary of all diagrams, processes, and exceptions in this chapter.`,
      });
    }
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
    const topic = classifyQuestion(q);
    const selectedOpt = q.options.find(o => o.id === a.selected);
    const correctOpt  = q.options.find(o => o.id === a.correct);
    const div = document.createElement('div');
    div.className = `review-item ${a.skipped ? 'was-skipped' : 'was-wrong'}`;

    const expl = q.answer.explanation?.trim();

    div.innerHTML = `
      <div class="review-q-meta">
        <span class="badge badge-year">${q.year}</span>
        <span class="badge badge-topic">${escapeHtml(topic.topic)}</span>
        ${a.skipped ? '<span class="badge badge-skipped">Skipped</span>' : ''}
      </div>
      <p class="review-q-text">${escapeHtml(q.question.text)}</p>
      <div class="review-answers">
        ${a.skipped ? '' : `
          <div class="review-ans-row">
            <span class="review-ans-label">Your answer</span>
            <span class="review-ans-val wrong">${selectedOpt ? escapeHtml(selectedOpt.text) : '—'}</span>
          </div>`}
        <div class="review-ans-row">
          <span class="review-ans-label">Correct answer</span>
          <span class="review-ans-val correct">${correctOpt ? `<strong>${correctOpt.id}.</strong> ${escapeHtml(correctOpt.text)}` : a.correct}</span>
        </div>
      </div>
      ${expl ? `<div class="review-explanation"><span class="expl-label">Explanation</span>${escapeHtml(expl)}</div>` : ''}
      <div class="review-ncert">📖 Study: ${escapeHtml(topic.ncert)}</div>`;
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

