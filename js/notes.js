import { getSession } from './auth.js?v=1784613961254';
import { t } from './i18n.js?v=1784613961254';

let container = null;
let currentSession = null;

// active windows
const activeWindows = new Map(); // key -> NoteWindow instance
let baseZIndex = 1000;

function saveWindowState() {
  const state = [];
  activeWindows.forEach((win, context) => {
    state.push({
      context: context,
      title: win.header.querySelector('.nw-title').textContent,
      bottom: win.el.style.bottom,
      right: win.el.style.right,
      zIndex: win.el.style.zIndex
    });
  });
  localStorage.setItem('anatomy101_open_notes', JSON.stringify(state));
}

function restoreWindowStates() {
  const stateStr = localStorage.getItem('anatomy101_open_notes');
  if (stateStr) {
    try {
      const state = JSON.parse(stateStr);
      state.forEach(s => {
        if (activeWindows.has(s.context)) return;
        const win = new NoteWindow(s.context, s.title, s.bottom, s.right, s.zIndex);
        activeWindows.set(s.context, win);
        if (parseInt(s.zIndex) > baseZIndex) baseZIndex = parseInt(s.zIndex);
      });
    } catch (e) { console.error(e); }
  }
}

export function initNotesWidget() {
  container = document.getElementById('notes-container');
  getSession().then(s => currentSession = s);
  window.addEventListener('anatomy101-loaded', restoreWindowStates);
}

class NoteWindow {
  constructor(context, title, savedBottom = null, savedRight = null, savedZIndex = null) {
    this.context = context;
    this.saveTimer = null;

    // Create DOM
    this.el = document.createElement('div');
    this.el.className = 'note-widget glass-panel';
    this.el.style.zIndex = savedZIndex ? savedZIndex : ++baseZIndex;

    // Spawn position (staggered slightly based on count)
    const offset = (activeWindows.size * 20) % 100;
    this.el.style.bottom = savedBottom ? savedBottom : `${24 + offset}px`;
    this.el.style.right = savedRight ? savedRight : `${24 + offset}px`;

    this.el.innerHTML = `
      <div class="nw-header">
        <h3 class="nw-title" contenteditable="true" spellcheck="false" title="Click to rename" style="cursor: text;">${title}</h3>
        <div class="nw-actions">
          <button class="nw-delete" aria-label="Delete note" title="Delete note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
            </svg>
          </button>
          <button class="nw-close" aria-label="Close notes panel">×</button>
        </div>
      </div>
      <div class="nw-body">
        <textarea class="nw-textarea" placeholder="${t('note_typing')}"></textarea>
        <div class="nw-status">${t('note_loading')}</div>
      </div>
    `;

    container.appendChild(this.el);

    this.textarea = this.el.querySelector('.nw-textarea');
    this.statusEl = this.el.querySelector('.nw-status');
    this.header = this.el.querySelector('.nw-header');

    // Bind events
    this.el.querySelector('.nw-close').addEventListener('click', () => this.close());
    this.el.querySelector('.nw-delete').addEventListener('click', () => this.delete());
    this.el.addEventListener('mousedown', () => this.focus());

    const titleEl = this.el.querySelector('.nw-title');
    // Store original title to revert if blanked
    let previousTitle = title;
    
    titleEl.addEventListener('blur', () => {
      let newTitle = titleEl.textContent.trim();
      if (!newTitle) {
        newTitle = previousTitle;
        titleEl.textContent = newTitle;
      } else {
        previousTitle = newTitle;
      }
      
      this.title = newTitle;
      let local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
      let existing = local.find(d => d.part_id === this.context);
      if (existing) {
        existing.title = newTitle;
        localStorage.setItem('anatomy101_bookmarks', JSON.stringify(local));
      }
      saveWindowState();
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });

    this.textarea.addEventListener('input', () => {
      if (!currentSession) {
        this.saveLocalNoteSynchronously();
      } else {
        this.statusEl.textContent = t('note_typing');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveNoteAPI(), 800);
      }
    });

    this.textarea.addEventListener('blur', () => {
      if (currentSession) {
        clearTimeout(this.saveTimer);
        this.saveNoteAPI();
      }
    });

    this.initDrag();
    this.loadNote();
    if (!savedBottom) saveWindowState();
  }

  focus() {
    this.el.style.zIndex = ++baseZIndex;
    saveWindowState();
  }

  close() {
    clearTimeout(this.saveTimer);
    if (currentSession && this.textarea.value.trim() !== '') this.saveNoteAPI();

    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';
    setTimeout(() => {
      if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      activeWindows.delete(this.context);
      saveWindowState();
    }, 300);
  }

  async delete() {
    clearTimeout(this.saveTimer);
    this.textarea.value = '';

    if (currentSession) {
      try {
        await fetch('/api/bookmarks', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
          body: JSON.stringify({ part_id: this.context })
        });
      } catch (err) { console.error(err); }
    }

    let local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
    local = local.filter(d => d.part_id !== this.context);
    localStorage.setItem('anatomy101_bookmarks', JSON.stringify(local));

    // Check if export modal is open and update it
    const modal = document.getElementById('export-modal');
    if (modal && modal.getAttribute('aria-hidden') === 'false') {
      // we need to dynamically refresh it, but it's fine just to re-call exportNotes if we can, or let user do it.
      // Better yet, just close the window
    }

    this.close();
  }

  initDrag() {
    let isDragging = false;
    let startX, startY, initialBottom, initialRight;

    const onPointerDown = (e) => {
      // Don't drag if clicking a button or title
      if (e.target.closest('button') || e.target.closest('.nw-title')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.el.getBoundingClientRect();
      const parentRect = container.getBoundingClientRect();

      // Calculate current bottom and right relative to container
      initialBottom = parentRect.height - rect.bottom;
      initialRight = parentRect.width - rect.right;

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);

      this.focus();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // We are moving absolute bottom/right, so moving mouse right (dx > 0) means right decreases.
      let newRight = initialRight - dx;
      let newBottom = initialBottom - dy;

      // Constraints
      const maxRight = container.clientWidth - this.el.offsetWidth;
      const maxBottom = container.clientHeight - this.el.offsetHeight;

      newRight = Math.max(0, Math.min(newRight, maxRight));
      newBottom = Math.max(0, Math.min(newBottom, maxBottom));

      this.el.style.right = `${newRight}px`;
      this.el.style.bottom = `${newBottom}px`;
    };

    const onPointerUp = () => {
      isDragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      saveWindowState();
    };

    this.header.addEventListener('pointerdown', onPointerDown);
  }

  loadNote() {
    if (currentSession) {
      fetch('/api/bookmarks', { headers: { 'Authorization': `Bearer ${currentSession.access_token}` } })
        .then(res => res.json())
        .then(data => {
          const bm = data.find(d => d.part_id === this.context);
          if (bm && bm.note) this.textarea.value = bm.note;
          this.statusEl.textContent = '';
        }).catch(err => {
          console.error(err);
          this.statusEl.textContent = t('note_error_loading');
        });
    } else {
      const local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
      const bm = local.find(d => d.part_id === this.context);
      if (bm && bm.note) this.textarea.value = bm.note;
      this.statusEl.textContent = '';
    }
  }

  saveLocalNoteSynchronously() {
    const val = this.textarea.value.trim();
    const local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
    const idx = local.findIndex(d => d.part_id === this.context);
    if (val === '') {
      if (idx > -1) local.splice(idx, 1);
    } else {
      if (idx > -1) {
        local[idx].note = val;
      } else {
        const title = this.el.querySelector('.nw-title').textContent.trim();
        local.push({ part_id: this.context, note: val, title: title });
      }
    }
    localStorage.setItem('anatomy101_bookmarks', JSON.stringify(local));
    this.statusEl.textContent = t('note_saved_local');
  }

  async saveNoteAPI() {
    const val = this.textarea.value.trim();
    this.statusEl.textContent = t('note_saving');
    try {
      await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ part_id: this.context, note: val })
      });
      this.statusEl.textContent = t('note_saved');
      setTimeout(() => { if (this.statusEl.textContent === t('note_saved')) this.statusEl.textContent = ''; }, 2000);
    } catch (err) {
      this.statusEl.textContent = t('note_error_saving');
    }
  }
}

export function openNotesWidget(partId = 'global') {
  if (!container) initNotesWidget();

  if (partId === 'global') {
    // Generate a unique context for multiple general notes
    const uniqueContext = `global_${Date.now()}`;
    const win = new NoteWindow(uniqueContext, t('general_note'));
    activeWindows.set(uniqueContext, win);
    saveWindowState();
  } else {
    // Organ notes - singleton
    if (activeWindows.has(partId)) {
      activeWindows.get(partId).focus();
    } else {
      let localNotes = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
      let existing = localNotes.find(n => n.part_id === partId);
      let title = existing && existing.title ? existing.title : (partId.startsWith('global') ? t('general_note') : partId);

      const win = new NoteWindow(partId, title);
      activeWindows.set(partId, win);
      saveWindowState();
    }
  }
}

export async function exportNotes() {
  let notes = [];
  if (currentSession) {
    try {
      const res = await fetch('/api/bookmarks', { headers: { 'Authorization': `Bearer ${currentSession.access_token}` } });
      notes = await res.json();
    } catch (e) {
      console.error(e);
      notes = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
    }
  } else {
    notes = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
  }

  let order = JSON.parse(localStorage.getItem('anatomy101_notes_order') || '[]');
  notes.sort((a, b) => {
    let ia = order.indexOf(a.part_id);
    let ib = order.indexOf(b.part_id);
    if (ia === -1) ia = 9999;
    if (ib === -1) ib = 9999;
    return ia - ib;
  });

  const renderNoteBlock = (n) => `
    <div class="em-note-block" data-id="${n.part_id}" draggable="true">
      <div class="em-note-header">
        <label class="em-note-checkbox">
          <input type="checkbox" class="em-check" value="${n.part_id}" checked>
          <div class="em-note-title">${n.title || (n.part_id.startsWith('global') ? 'General Note' : n.part_id)}</div>
        </label>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="em-btn-edit" aria-label="Edit Note" data-id="${n.part_id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </button>
          <button class="em-btn-delete" aria-label="Delete Note" data-id="${n.part_id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
          </button>
          <div class="em-drag-handle" style="cursor:grab; opacity:0.5; font-size:16px;">⋮⋮</div>
        </div>
      </div>
      <div class="em-note-content">${n.note}</div>
    </div>
  `;

  const html = `
  <div id="em-dnd-container">
    ${notes.length > 0 ? notes.map(renderNoteBlock).join('') : '<p>You have not saved any notes yet.</p>'}
  </div>
  `;

  const modal = document.getElementById('export-modal');
  const body = document.getElementById('em-body');

  if (modal && body) {
    body.innerHTML = html;
    modal.setAttribute('aria-hidden', 'false');

    const updateExports = () => {
      const checkedBoxes = Array.from(body.querySelectorAll('.em-check:checked'));
      const selectedIds = new Set(checkedBoxes.map(cb => cb.value));
      const selectedNotes = notes.filter(n => selectedIds.has(n.part_id));

      let exportText = "Check out my Anatomy101 notes!\n\n";
      selectedNotes.forEach(n => {
        const title = n.title || (n.part_id.startsWith('global') ? 'General Note' : n.part_id);
        exportText += `${title}:\n${n.note}\n\n`;
      });

      document.getElementById('em-wa-btn').href = `whatsapp://send?text=${encodeURIComponent(exportText)}`;
      document.getElementById('em-mail-btn').href = `mailto:?subject=My Anatomy Notes&body=${encodeURIComponent(exportText)}`;
    };

    updateExports();

    // Clean old listener by cloning
    const oldBody = body;
    const newBody = oldBody.cloneNode(true);
    oldBody.parentNode.replaceChild(newBody, oldBody);

    // Re-assign body reference
    const activeBody = document.getElementById('em-body');

    activeBody.addEventListener('click', async (e) => {
      // 1. Delete button
      const deleteBtn = e.target.closest('.em-btn-delete');
      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        if (currentSession) {
          try {
            await fetch('/api/bookmarks', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
              body: JSON.stringify({ part_id: id })
            });
          } catch (err) { console.error(err); }
        }
        let local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
        local = local.filter(d => d.part_id !== id);
        localStorage.setItem('anatomy101_bookmarks', JSON.stringify(local));

        if (activeWindows.has(id)) activeWindows.get(id).close();
        exportNotes(); // refresh modal
        return;
      }

      // 2. Checkbox toggled
      if (e.target.closest('.em-check') || e.target.closest('.em-note-checkbox')) {
        // give browser time to update checked state
        setTimeout(updateExports, 0);
        return;
      }

      // 3. Click edit icon
      const editBtn = e.target.closest('.em-btn-edit');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        modal.setAttribute('aria-hidden', 'true');
        openNotesWidget(id);
        return;
      }
    });

    // Drag and Drop Logic
    const dndContainer = activeBody.querySelector('#em-dnd-container');
    if (dndContainer) {
      let draggedEl = null;
      dndContainer.addEventListener('dragstart', e => {
        draggedEl = e.target.closest('.em-note-block');
        if (draggedEl) {
          draggedEl.style.opacity = '0.5';
          e.dataTransfer.effectAllowed = 'move';
        }
      });
      dndContainer.addEventListener('dragover', e => {
        e.preventDefault();
        const overEl = e.target.closest('.em-note-block');
        if (overEl && overEl !== draggedEl) {
          const rect = overEl.getBoundingClientRect();
          const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          dndContainer.insertBefore(draggedEl, next ? overEl.nextSibling : overEl);
        }
      });
      dndContainer.addEventListener('dragend', e => {
        if (draggedEl) {
          draggedEl.style.opacity = '1';
          const newOrder = Array.from(dndContainer.querySelectorAll('.em-note-block')).map(el => el.getAttribute('data-id'));
          localStorage.setItem('anatomy101_notes_order', JSON.stringify(newOrder));
        }
      });
    }

    document.getElementById('em-print-btn').onclick = () => {
      const checkedBoxes = Array.from(activeBody.querySelectorAll('.em-check:checked'));
      const selectedIds = checkedBoxes.map(cb => cb.value);
      sessionStorage.setItem('anatomy101_export_selection', JSON.stringify(selectedIds));
      window.open('export.html', '_blank');
    };

    document.getElementById('em-close').onclick = () => modal.setAttribute('aria-hidden', 'true');
  }
}
