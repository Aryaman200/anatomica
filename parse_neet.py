"""
parse_neet.py — NEET PDF pipeline
====================================
Scans neet-biology-db/pdfs/*.pdf, extracts Physics/Chemistry/Biology
questions using section-header detection (no numeric-range fallback).
Emits schema-valid JSON into subject questions/ dirs.

Two PDF formats handled:
  FORMAT_A  MedicNEET standard (2016–2026-may):
    - p1: section header line  "Physics – 45 Qs"  etc.
    - Questions inline as "N. <text>" with "(1)...(4)" options
    - Last page: "Answer Key" then grid  Q: ANS  Q: ANS ...
  FORMAT_B  ReNEET 2026 (answer+solution interleaved, 72 pp):
    - Each question appears as "N.  <text>" then "(1)...(4)" options
    - Immediately followed by "Answer (X)" + "Sol. ..."
    - Last pages: "Answer Key – quick reference" table

Usage:
  python parse_neet.py [--dry-run] [--pdf path/to/file.pdf]

Options:
  --dry-run     Parse but do not write files (show counts only)
  --pdf FILE    Process only this PDF (default: all in pdfs/)
  --force       Overwrite existing output JSON files
"""

import re
import os
import sys
import json
import fitz  # PyMuPDF

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PDF_DIR      = os.path.join(SCRIPT_DIR, 'neet-biology-db', 'pdfs')
SUBJECT_DIRS = {
    'Physics':   os.path.join(SCRIPT_DIR, 'neet-physics-db',   'questions'),
    'Chemistry': os.path.join(SCRIPT_DIR, 'neet-chemistry-db', 'questions'),
    'Biology':   os.path.join(SCRIPT_DIR, 'neet-biology-db',   'questions'),
}

# ---------------------------------------------------------------------------
# Regex
# ---------------------------------------------------------------------------
# Section header:  "Physics · 45 Qs"  or  "Physics – 45 Qs"  or  "Physics"
# Separator may be: · (U+00B7 middle dot), – (en dash), — (em dash), - (hyphen), or absent
RE_SECTION_HDR  = re.compile(
    r'^(?P<subj>Physics|Chemistry|Biology|Botany|Zoology)'
    '(?:\\s*[\\-\u00B7\u2013\u2014\u2022\u2024]\\s*\\d+\\s*Qs?)?'
    r'\s*$',
    re.IGNORECASE,
)
# Question start: "12." or "12. " at line start  (also matches "12.  text")
RE_Q_START      = re.compile(r'^(\d{1,3})\.\s+(.*)', re.DOTALL)
# Option lines: "(1) text" or "(A) text" or "A. text" style
RE_OPT_ABCD     = re.compile(r'^\(([1-4ABCD])\)\s+(.*)', re.DOTALL)
RE_OPT_DOT      = re.compile(r'^([ABCD])\.\s+(.*)', re.DOTALL)
# Answer key page line: "Q. ANS" repeated across columns, or "1.A" or "1: D"
RE_AK_ENTRY     = re.compile(r'\b(\d{1,3})[\.:]\s*([1-4ABCD])\b')
# Inline answer (FORMAT_B reneet): "Answer (3)"
RE_INLINE_ANS   = re.compile(r'^Answer\s+\(([1-4ABCD])\)', re.IGNORECASE)
RE_INLINE_ANS2  = re.compile(r'^Answer\s+([1-4ABCD])\b',   re.IGNORECASE)

# Year extraction from filename
RE_YEAR         = re.compile(r'(20\d{2})')
# Phase detection
RE_PHASE1       = re.compile(r'phase[-_]?1', re.IGNORECASE)
RE_PHASE2       = re.compile(r'phase[-_]?2', re.IGNORECASE)
RE_ODISHA       = re.compile(r'odisha', re.IGNORECASE)
RE_RENEET       = re.compile(r'reneet', re.IGNORECASE)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def normalise_subject(raw: str) -> str:
    """Map Botany/Zoology → Biology; canonicalise case."""
    r = raw.strip().title()
    if r in ('Botany', 'Zoology'):
        return 'Biology'
    return r  # Physics / Chemistry / Biology

def option_letter(raw: str) -> str:
    """Convert '1'→'A', '2'→'B', 'A'→'A' etc."""
    MAP = {'1': 'A', '2': 'B', '3': 'C', '4': 'D',
           'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D'}
    return MAP.get(raw.upper(), raw.upper())

def extract_pages(doc) -> list[str]:
    """Return list of page texts."""
    return [page.get_text('text') for page in doc]

def split_lines(text: str) -> list[str]:
    return [l.strip() for l in text.split('\n')]

def year_from_name(name: str) -> int:
    m = RE_YEAR.search(name)
    return int(m.group(1)) if m else 0

def paper_code_from_name(name: str) -> str:
    n = name.replace('.pdf', '')
    if RE_PHASE1.search(n): return 'Phase-1'
    if RE_PHASE2.search(n): return 'Phase-2'
    if RE_ODISHA.search(n): return 'Odisha'
    if RE_RENEET.search(n): return 'ReNEET'
    return 'Main'

def subj_code(subj: str) -> str:
    return {'Physics': 'PHY', 'Chemistry': 'CHE', 'Biology': 'BIO'}[subj]

def make_q_id(year: int, paper_code: str, subj: str, qnum: int) -> str:
    yr = str(year)
    pc = paper_code.replace('-', '').upper()  # e.g. PHASE1, MAIN, RENEET
    sc = subj_code(subj)
    return f'NEET-{yr}-{pc}-{sc}-{qnum:03d}'

def make_stub(year, paper_code, pdf_name, subj, qnum, qtext, opts, correct, explanation='') -> dict:
    """Produce a schema-valid question object."""
    qid = make_q_id(year, paper_code, subj, qnum)
    unparseable = not opts  # flag if options extraction failed
    return {
        'id': qid,
        'year': year,
        'exam': {
            'name': 'NEET UG',
            'phase': paper_code,
            'paper_code': 'Unknown',
        },
        'source': {
            'pdf': pdf_name,
            'page': None,
            'question_number': qnum,
        },
        'subject': subj,
        'branch': subj,
        'question': {
            'text': qtext.strip(),
            'language': 'en',
            'has_image': False,
            'image': None,
            'has_table': False,
            'table': None,
        },
        'options': [{'id': o['id'], 'text': o['text']} for o in opts],
        'answer': {
            'correct': correct or '',
            'explanation': explanation.strip(),
        },
        'classification': {
            'class': None,
            'unit': None,
            'chapter': None,
            'topic': None,
            'subtopic': None,
        },
        'biology': {
            'system': [], 'organs': [], 'cellular_components': [],
            'molecules': [], 'species': [], 'diseases': [], 'processes': [],
        },
        'taxonomy': {'kingdom': None, 'phylum': None, 'class': None},
        'question_metadata': {
            'type': 'Conceptual',
            'difficulty': 'Medium',
            'source_type': 'raw_pdf' if unparseable else 'parsed_pdf',
            'statement_based': False,
            'assertion_reason': False,
            'diagram_based': False,
            'match_the_following': False,
            'multi_statement': False,
            'experimental': False,
        },
        'learning': {
            'keywords': [],
            'memory_tags': [],
            'estimated_time_seconds': 60,
            'bloom_level': 'Application',
            'high_yield': False,
        },
        'repetition': {'repeat_count': 0, 'repeat_type': None, 'similar_questions': []},
        'embeddings': {'vector_id': None, 'model': None},
        'graph': {'node_id': qid, 'connected_nodes': []},
    }

# ---------------------------------------------------------------------------
# FORMAT DETECTION
# ---------------------------------------------------------------------------
def is_format_b(doc, filename: str) -> bool:
    """ReNEET / interleaved-solutions format."""
    if RE_RENEET.search(filename):
        return True
    # Heuristic: check p1 for "Answers & Solutions"
    p1 = doc[0].get_text('text') if len(doc) > 0 else ''
    if 'Answers' in p1 and 'Solutions' in p1:
        return True
    return False

# ---------------------------------------------------------------------------
# SECTION HEADER DETECTION  (used by Format A)
# ---------------------------------------------------------------------------
MEDICNEET_NOISE = re.compile(r'^(MedicNEET|MedicNEE|MedicN|Medic|EET|cNEET|T|M)$')

def detect_sections_format_a(flat: list[tuple[str, int]]) -> list[tuple[int, str, int]]:
    """
    Scan all lines for section headers of the form "Physics – 45 Qs".
    Returns sorted list of (flat_idx, subject, page_index).
    """
    sections = []
    for i, (ln, pi) in enumerate(flat):
        m = RE_SECTION_HDR.match(ln)
        if m:
            subj = normalise_subject(m.group('subj'))
            sections.append((i, subj, pi))
    return sections

# ---------------------------------------------------------------------------
# QUESTION BLOCK PARSING  (shared)
# ---------------------------------------------------------------------------
def build_flat_lines(pages: list[str]) -> list[tuple[str, int]]:
    """
    Return list of (stripped_line, page_index) for all pages,
    filtering MedicNEET watermark noise.
    """
    result = []
    for pi, text in enumerate(pages):
        for ln in text.split('\n'):
            s = ln.strip()
            if MEDICNEET_NOISE.match(s):
                continue
            result.append((s, pi))
    return result

def parse_option_line(ln: str) -> tuple[str | None, str]:
    """Try to parse an option line. Returns (letter, text) or (None, '')."""
    m = RE_OPT_ABCD.match(ln)
    if m:
        return option_letter(m.group(1)), m.group(2).strip()
    m = RE_OPT_DOT.match(ln)
    if m:
        return option_letter(m.group(1)), m.group(2).strip()
    return None, ''

# ---------------------------------------------------------------------------
# ANSWER KEY PARSING
# ---------------------------------------------------------------------------
def parse_answer_key_page(text: str) -> dict[int, str]:
    """Parse the final answer-key grid page. Returns {qnum: letter}."""
    answers = {}
    for m in RE_AK_ENTRY.finditer(text):
        qnum = int(m.group(1))
        ans  = option_letter(m.group(2))
        if 1 <= qnum <= 250:  # sanity
            answers[qnum] = ans
    return answers

def find_answer_key(pages: list[str]) -> dict[int, str]:
    """
    Find answer key from last pages.
    Tries last 5 pages, picks the one with the most AK entries.
    """
    best = {}
    for text in pages[-5:]:
        if 'Answer Key' in text or 'answer key' in text.lower():
            ak = parse_answer_key_page(text)
            if len(ak) > len(best):
                best = ak
    return best

# ---------------------------------------------------------------------------
# FORMAT A PARSER  (standard MedicNEET papers)
# ---------------------------------------------------------------------------
def parse_format_a(doc, filename: str, year: int, paper_code: str) -> dict[str, list]:
    """
    Returns {'Biology': [...], 'Physics': [...], 'Chemistry': [...]}
    """
    pages = extract_pages(doc)
    flat  = build_flat_lines(pages)
    n     = len(flat)

    # 1. Locate section boundaries
    sections_raw = detect_sections_format_a(flat)
    print(f'  [DEBUG] sections_raw: {sections_raw}')
    if not sections_raw:
        print(f'  [WARN] {filename}: no section headers found, skipping.')
        return {}

    # 2. Find answer key
    answer_key = find_answer_key(pages)
    if not answer_key:
        print(f'  [WARN] {filename}: no answer key found.')

    # 3. Build section map: for each line index, which subject?
    # sections_raw is list of (global_flat_idx, subject, page_idx)
    # We need to map from global flat index to subject

    # Re-compute global flat indices with noise filtering included
    # Use section positions directly in flat[] space
    # Find where each section header occurs in flat lines
    subj_ranges = []  # [(start_flat_idx, subj)]
    for (gidx, subj, pi) in sections_raw:
        subj_ranges.append((gidx, subj))
    subj_ranges.sort()

    def subj_at(flat_idx: int) -> str | None:
        """Which subject section is flat_idx in?"""
        cur = None
        for (start, s) in subj_ranges:
            if flat_idx >= start:
                cur = s
        return cur

    # 4. Parse questions
    results: dict[str, list] = {'Physics': [], 'Chemistry': [], 'Biology': []}
    i = 0
    current_subj = None
    current_qnum = None
    current_qtext_parts: list[str] = []
    current_opts: list[dict] = []
    current_opt_letter = None
    current_opt_parts: list[str] = []

    def flush_opt():
        nonlocal current_opt_letter, current_opt_parts
        if current_opt_letter and current_opt_parts:
            current_opts.append({
                'id': current_opt_letter,
                'text': ' '.join(current_opt_parts).strip(),
            })
        current_opt_letter = None
        current_opt_parts = []

    def flush_question():
        nonlocal current_qnum, current_qtext_parts, current_opts
        if current_qnum is None or current_subj is None:
            return
        flush_opt()
        qtext = ' '.join(current_qtext_parts).strip()
        ans   = answer_key.get(current_qnum, '')
        q = make_stub(year, paper_code, filename, current_subj,
                      current_qnum, qtext, current_opts, ans)
        results[current_subj].append(q)
        current_qnum       = None
        current_qtext_parts = []
        current_opts        = []

    while i < n:
        ln, pi = flat[i]
        current_subj = subj_at(i)

        # Check for section header — skip it
        if RE_SECTION_HDR.match(ln):
            flush_question()
            i += 1
            continue

        # Check for answer key section — stop parsing questions
        if re.match(r'Answer\s+Key', ln, re.IGNORECASE):
            flush_question()
            break

        # Check new question
        m = RE_Q_START.match(ln)
        if m:
            flush_question()
            current_qnum = int(m.group(1))
            rest = m.group(2).strip()
            current_qtext_parts = [rest] if rest else []
            current_opts = []
            current_opt_letter = None
            current_opt_parts = []
            i += 1
            continue

        # Check option line
        if current_qnum is not None:
            letter, opt_text = parse_option_line(ln)
            if letter:
                flush_opt()
                current_opt_letter = letter
                current_opt_parts  = [opt_text] if opt_text else []
                i += 1
                continue
            # continuation of current option or question text
            if current_opt_letter:
                if ln:
                    current_opt_parts.append(ln)
            else:
                if ln:
                    current_qtext_parts.append(ln)

        i += 1

    flush_question()
    return results

# ---------------------------------------------------------------------------
# FORMAT B PARSER  (ReNEET interleaved solutions)
# ---------------------------------------------------------------------------
def parse_format_b(doc, filename: str, year: int, paper_code: str) -> dict[str, list]:
    """
    ReNEET: questions with (1)/(2)/(3)/(4) options, answer inline as
    "Answer (N)" / "Answer N", subjects determined from answer-key table
    headers at end of doc.
    """
    pages  = extract_pages(doc)
    flat   = build_flat_lines(pages)
    n      = len(flat)

    # 1. Find section order from answer key table at end
    # Look for  Physics / Chemistry / Biology  as standalone lines
    # in the last 5 pages
    section_order = []  # ordered list of subjects as they appear
    for text in pages[-5:]:
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for ln in lines:
            m = RE_SECTION_HDR.match(ln)
            if m:
                s = normalise_subject(m.group('subj'))
                if s not in section_order:
                    section_order.append(s)

    if not section_order:
        # Default ReNEET order
        section_order = ['Physics', 'Chemistry', 'Biology']
        print(f'  [WARN] {filename}: no section order in AK, using default PHY/CHE/BIO.')

    # 2. Parse answer key (with numeric keys) — last pages
    answer_key = find_answer_key(pages)

    # 3. Collect subject ranges from AK
    # The AK table lists per-subject Q numbers and answers.
    # We'll assign subjects by Q# ranges read from the AK.
    # Build ranges: read AK table pages for section headers + Q-ans pairs.
    subj_qranges: dict[str, tuple[int, int]] = {}  # subj -> (min_q, max_q)
    cur_ak_subj = None
    for text in pages[-5:]:
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for ln in lines:
            m = RE_SECTION_HDR.match(ln)
            if m:
                cur_ak_subj = normalise_subject(m.group('subj'))
                continue
            if cur_ak_subj:
                for em in RE_AK_ENTRY.finditer(ln):
                    qnum = int(em.group(1))
                    if cur_ak_subj not in subj_qranges:
                        subj_qranges[cur_ak_subj] = (qnum, qnum)
                    else:
                        lo, hi = subj_qranges[cur_ak_subj]
                        subj_qranges[cur_ak_subj] = (min(lo, qnum), max(hi, qnum))

    def subj_for_qnum(qnum: int) -> str:
        for s, (lo, hi) in subj_qranges.items():
            if lo <= qnum <= hi:
                return s
        return ''

    print(f'  [DEBUG] subj_qranges = {subj_qranges}')

    # 4. Parse questions + inline answers
    results: dict[str, list] = {'Physics': [], 'Chemistry': [], 'Biology': []}
    i = 0
    current_qnum = None
    current_qtext_parts: list[str] = []
    current_opts: list[dict]       = []
    current_opt_letter = None
    current_opt_parts: list[str]   = []
    current_inline_ans = ''
    current_explanation_parts: list[str] = []
    in_solution = False

    def flush_opt():
        nonlocal current_opt_letter, current_opt_parts
        if current_opt_letter and current_opt_parts:
            current_opts.append({
                'id': current_opt_letter,
                'text': ' '.join(current_opt_parts).strip(),
            })
        current_opt_letter = None
        current_opt_parts  = []

    def flush_question():
        nonlocal current_qnum, current_qtext_parts, current_opts
        nonlocal current_inline_ans, current_explanation_parts, in_solution
        if current_qnum is None:
            return
        flush_opt()
        subj = subj_for_qnum(current_qnum)
        if not subj:
            # Reset
            current_qnum               = None
            current_qtext_parts        = []
            current_opts               = []
            current_inline_ans         = ''
            current_explanation_parts  = []
            in_solution                = False
            return
        qtext = ' '.join(current_qtext_parts).strip()
        # prefer AK answer; fall back to inline
        ans   = answer_key.get(current_qnum, '') or current_inline_ans
        expl  = ' '.join(current_explanation_parts).strip()
        q = make_stub(year, paper_code, filename, subj,
                      current_qnum, qtext, current_opts, ans, expl)
        results[subj].append(q)
        current_qnum               = None
        current_qtext_parts        = []
        current_opts               = []
        current_inline_ans         = ''
        current_explanation_parts  = []
        in_solution                = False

    while i < n:
        ln, pi = flat[i]

        # Answer-key quick-reference section → stop
        if re.search(r'Answer\s+Key.*quick\s+reference', ln, re.IGNORECASE):
            flush_question()
            break

        # Inline answer line
        m = RE_INLINE_ANS.match(ln)
        if not m:
            m = RE_INLINE_ANS2.match(ln)
        if m and current_qnum is not None:
            flush_opt()
            current_inline_ans = option_letter(m.group(1))
            in_solution = False
            i += 1
            continue

        # Solution line
        if ln.startswith('Sol.') and current_qnum is not None:
            flush_opt()
            in_solution = True
            rest = ln[4:].strip()
            if rest:
                current_explanation_parts.append(rest)
            i += 1
            continue

        # New question
        m = RE_Q_START.match(ln)
        if m:
            flush_question()
            current_qnum = int(m.group(1))
            rest = m.group(2).strip()
            current_qtext_parts       = [rest] if rest else []
            current_opts              = []
            current_opt_letter        = None
            current_opt_parts         = []
            current_inline_ans        = ''
            current_explanation_parts = []
            in_solution               = False
            i += 1
            continue

        # Option line
        if current_qnum is not None and not in_solution:
            letter, opt_text = parse_option_line(ln)
            if letter:
                flush_opt()
                current_opt_letter = letter
                current_opt_parts  = [opt_text] if opt_text else []
                i += 1
                continue
            # Continuation
            if current_opt_letter:
                if ln:
                    current_opt_parts.append(ln)
            else:
                if ln:
                    current_qtext_parts.append(ln)
        elif current_qnum is not None and in_solution and ln:
            current_explanation_parts.append(ln)

        i += 1

    flush_question()
    return results

# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------
def load_existing_ids(subject_dir: str) -> set[str]:
    """Read all existing JSON in the dir, collect all 'id' values."""
    ids = set()
    if not os.path.isdir(subject_dir):
        return ids
    for fname in os.listdir(subject_dir):
        if not fname.endswith('.json'):
            continue
        fpath = os.path.join(subject_dir, fname)
        try:
            with open(fpath, encoding='utf-8') as f:
                data = json.load(f)
            for q in data:
                if isinstance(q, dict) and 'id' in q:
                    ids.add(q['id'])
        except Exception:
            pass
    return ids

def output_filename(pdf_basename: str, subject: str) -> str:
    """e.g.  neet-2024.pdf + Biology → neet-2024_biology.json"""
    base = pdf_basename.replace('.pdf', '')
    return f'{base}_{subject.lower()}.json'

def process_pdf(pdf_path: str, dry_run: bool = False, force: bool = False):
    filename = os.path.basename(pdf_path)
    year      = year_from_name(filename)
    paper_code = paper_code_from_name(filename)

    print(f'\n[PDF] {filename}  year={year}  paper={paper_code}')

    doc = fitz.open(pdf_path)
    fmt_b = is_format_b(doc, filename)
    print(f'      format={"B (interleaved)" if fmt_b else "A (standard)"}')

    if fmt_b:
        results = parse_format_b(doc, filename, year, paper_code)
    else:
        results = parse_format_a(doc, filename, year, paper_code)
    doc.close()

    for subj, questions in results.items():
        subj_dir  = SUBJECT_DIRS[subj]
        out_fname = output_filename(filename, subj)
        out_path  = os.path.join(subj_dir, out_fname)

        # Dedup against existing
        existing_ids = load_existing_ids(subj_dir)
        new_qs = [q for q in questions if q['id'] not in existing_ids]
        skipped = len(questions) - len(new_qs)

        flagged = sum(1 for q in new_qs if q['question_metadata'].get('source_type') == 'raw_pdf')

        print(f'  [{subj:9s}] total={len(questions):3d}  new={len(new_qs):3d}  '
              f'skipped(dup)={skipped:3d}  flagged(no-opts)={flagged:3d}  '
              f'-> {out_fname}')

        if dry_run:
            continue

        if not new_qs:
            print(f'             (nothing new to write)')
            continue

        if os.path.exists(out_path) and not force:
            print(f'             [SKIP] file exists (use --force to overwrite)')
            continue

        os.makedirs(subj_dir, exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(new_qs, f, ensure_ascii=False, indent=2)
        print(f'             written {len(new_qs)} questions.')

def main():
    dry_run  = '--dry-run' in sys.argv
    force    = '--force'   in sys.argv
    specific = None
    if '--pdf' in sys.argv:
        idx = sys.argv.index('--pdf')
        specific = sys.argv[idx + 1]

    if specific:
        pdfs = [specific]
    else:
        pdfs = sorted([
            os.path.join(PDF_DIR, f)
            for f in os.listdir(PDF_DIR)
            if f.endswith('.pdf')
        ])

    if dry_run:
        print('=== DRY RUN — no files written ===')

    for pdf in pdfs:
        try:
            process_pdf(pdf, dry_run=dry_run, force=force)
        except Exception as e:
            print(f'  [ERROR] {os.path.basename(pdf)}: {e}')

    print('\nDone.')

if __name__ == '__main__':
    main()
