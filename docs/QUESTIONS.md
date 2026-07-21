# NEET Quiz Question Data

The quiz engine (`quiz.html` + `js/quiz.js`) reads a single global array called
`QUIZ_DATA`. That array is **generated** — never hand-edit it — by bundling the
per-subject question databases together.

## Pipeline overview

```
neet-biology-db/questions/*.json   ┐
neet-physics-db/questions/*.json   ├──> node scripts/gen-quiz-data.mjs ──> neet-biology-db/quiz-data.js
neet-chemistry-db/questions/*.json ┘                                        (defines `const QUIZ_DATA = [...]`)
```

- `scripts/gen-quiz-data.mjs` scans the `questions/` directory of each subject
  database, concatenates every question object, and writes the browser bundle.
- The output file `neet-biology-db/quiz-data.js` and the global name `QUIZ_DATA`
  are intentionally **unchanged** from the original biology-only setup, so
  `quiz.html` (a plain `<script src="neet-biology-db/quiz-data.js">` include)
  needs no edit — Physics and Chemistry questions simply appear mixed in
  alongside Biology.

### Regenerate the bundle

From the repo root:

```
node scripts/gen-quiz-data.mjs
```

It prints per-subject counts, e.g.:

```
Bundled NEET quiz questions:
  Biology    554
  Physics    8
  Chemistry  8
  TOTAL      570
Written 570 questions to neet-biology-db\quiz-data.js
```

## Question schema

Each question is a JSON object. The fields the quiz engine actually consumes are
marked **[used]**; the rest are metadata that travels with the question and is
safe to include.

```jsonc
{
  "id": "NEET-2021-BIO-101",            // [used] unique id
  "year": 2021,                          // [used] shown as a badge; drives the year filter
  "subject": "Biology",                  // "Biology" | "Physics" | "Chemistry"
  "branch": "Unknown",
  "question": {
    "text": "Which of the following plants is monoecious?", // [used] rendered as the prompt
    "language": "en",
    "has_image": false,
    "image": null,
    "has_table": false,
    "table": null
  },
  "options": [                           // [used] rendered as answer buttons
    { "id": "A", "text": "Carica papaya" },
    { "id": "B", "text": "Chara" },
    { "id": "C", "text": "Marchantia polymorpha" },
    { "id": "D", "text": "Cycas circinalis" }
  ],
  "answer": {
    "correct": "B",                      // [used] MUST equal one of the option ids
    "explanation": "..."                 // [used] shown in the review screen
  },
  "question_metadata": {
    "topic": "General Biology",          // NEET chapter/topic name
    "difficulty": "Medium",              // Easy | Medium | Hard
    "type": "Conceptual",                // [used] shown as the type badge
    "statement_based": false,            // [used] flags that push a question to "Hard"
    "assertion_reason": false,           // [used]
    "match_the_following": false,        // [used]
    "diagram_based": false,
    "multi_statement": false,
    "experimental": false
  }
}
```

Notes:

- **`answer` is an object**, not a bare string. The engine reads
  `q.answer.correct` (the correct option `id`) and `q.answer.explanation`.
  A question whose `answer.correct` does not match any `option.id` will render
  with no correct option highlighted — always keep them in sync.
- The engine computes a **displayed difficulty** from question-text length and
  the `statement_based` / `match_the_following` / `assertion_reason` flags
  (`computeDifficulty` in `js/quiz.js`); the stored `difficulty` string is
  metadata and is not what the difficulty filter matches against.
- Biology questions additionally carry richer blocks (`exam`, `source`,
  `classification`, `biology`, `taxonomy`, `learning`, etc.). These are optional
  and ignored by the engine; keep them if present.

## Adding real past-paper questions

To add real Physics or Chemistry past papers (or more Biology):

1. Produce a JSON file that is an **array** of question objects following the
   schema above. Set `subject` correctly (`"Physics"` or `"Chemistry"`). Real
   questions should **not** carry `"sample": true` and should reference the
   actual source PDF instead of `"placeholder"`.
2. Drop the file into the matching subject's `questions/` directory:
   - Physics  → `neet-physics-db/questions/`
   - Chemistry → `neet-chemistry-db/questions/`
   - Biology  → `neet-biology-db/questions/`
3. Rerun the bundler: `node scripts/gen-quiz-data.mjs`.

The bundler picks up every `*.json` file in each `questions/` directory
automatically — no code change needed.

## ⚠️ Physics & Chemistry are currently SAMPLES only

The current Physics and Chemistry entries live in
`neet-physics-db/questions/samples.json` and
`neet-chemistry-db/questions/samples.json`. They are a **small, clearly-marked
placeholder set** (8 questions each), present only to exercise the multi-subject
pipeline and UI. Every one of them is tagged:

- `"sample": true`
- `"source": { "pdf": "placeholder", ... }`

These are **not** an authoritative NEET question bank. Replace them with real,
verified past-paper questions before treating Physics/Chemistry as exam-ready:
delete (or keep, but supersede) the `samples.json` file, drop real past-paper
JSON files into the subject's `questions/` directory, and rerun the bundler.

Biology, by contrast, is sourced from real NEET/AIPMT past papers
(`neet-biology-db/questions/*.json`).
