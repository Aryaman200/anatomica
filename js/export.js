import { getSession } from './auth.js?v=1784611432079';
import { initI18n, t } from './i18n.js?v=1784611432079';

let currentSession = null;
let notes = [];

async function loadNotes() {
  await initI18n();
  await getSession().then(s => currentSession = s);
  
  if (currentSession) {
    try {
      const res = await fetch('/api/bookmarks', { headers: { 'Authorization': `Bearer ${currentSession.access_token}` } });
      notes = await res.json();
    } catch (e) {
      notes = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
    }
  } else {
    notes = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
  }
  
  // Filter by selection
  const selectionStr = sessionStorage.getItem('anatomy101_export_selection');
  if (selectionStr) {
    const selectedIds = new Set(JSON.parse(selectionStr));
    notes = notes.filter(n => selectedIds.has(n.part_id));
  }
  
  render();
}

function render() {
  let order = JSON.parse(localStorage.getItem('anatomy101_notes_order') || '[]');
  notes.sort((a, b) => {
    let ia = order.indexOf(a.part_id);
    let ib = order.indexOf(b.part_id);
    if (ia === -1) ia = 9999;
    if (ib === -1) ib = 9999;
    return ia - ib;
  });
  
  const list = document.getElementById('notes-list');
  
  if (notes.length === 0) {
    list.innerHTML = '<p>No notes selected.</p>';
    updateShareLinks();
    return;
  }
  
  list.innerHTML = notes.map(n => `
    <div class="note-block" data-id="${n.part_id}" draggable="true">
      <div class="note-header">
        <div class="note-title">${n.title || (n.part_id.startsWith('global') ? 'General Note' : n.part_id)}</div>
        <div class="note-actions">
          <button class="btn-action edit" aria-label="Edit Note" data-id="${n.part_id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </button>
          <button class="btn-action delete" aria-label="Delete Note" data-id="${n.part_id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
          </button>
          <div class="drag-handle">⋮⋮</div>
        </div>
      </div>
      <div class="note-content" id="content-${n.part_id}">${n.note}</div>
    </div>
  `).join('');
  
  updateShareLinks();
  bindEvents();
}

function updateShareLinks() {
  let exportText = "Check out my Anatomy101 notes!\n\n";
  notes.forEach(n => {
    const title = n.title || (n.part_id.startsWith('global') ? 'General Note' : n.part_id);
    exportText += `${title}:\n${n.note}\n\n`;
  });
  
  document.getElementById('btn-wa').href = `whatsapp://send?text=${encodeURIComponent(exportText)}`;
  document.getElementById('btn-mail').href = `mailto:?subject=My Anatomy Notes&body=${encodeURIComponent(exportText)}`;
}

function bindEvents() {
  const list = document.getElementById('notes-list');
  
  // Drag and Drop
  let draggedEl = null;
  list.addEventListener('dragstart', e => {
    const block = e.target.closest('.note-block');
    if (block) {
      draggedEl = block;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });
  
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const overEl = e.target.closest('.note-block');
    if (overEl && overEl !== draggedEl) {
      const rect = overEl.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      list.insertBefore(draggedEl, next ? overEl.nextSibling : overEl);
    }
  });
  
  list.addEventListener('dragend', e => {
    if (draggedEl) {
      draggedEl.classList.remove('dragging');
      const newOrder = Array.from(list.querySelectorAll('.note-block')).map(el => el.getAttribute('data-id'));
      localStorage.setItem('anatomy101_notes_order', JSON.stringify(newOrder));
    }
  });
  
  // Edit and Delete
  list.addEventListener('click', async e => {
    // Edit
    const editBtn = e.target.closest('.btn-action.edit');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const contentDiv = document.getElementById(`content-${id}`);
      if (contentDiv.getAttribute('contenteditable') === 'true') {
        // Save it
        contentDiv.setAttribute('contenteditable', 'false');
        editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
        editBtn.classList.remove('save');
        
        const newText = contentDiv.textContent;
        const noteObj = notes.find(n => n.part_id === id);
        if (noteObj) noteObj.note = newText;
        
        // Save to local storage
        let local = JSON.parse(localStorage.getItem('anatomy101_bookmarks') || '[]');
        const idx = local.findIndex(d => d.part_id === id);
        if (idx > -1) local[idx].note = newText;
        localStorage.setItem('anatomy101_bookmarks', JSON.stringify(local));
        
        // Save to API
        if (currentSession) {
          try {
            await fetch('/api/bookmarks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
              body: JSON.stringify({ part_id: id, note: newText })
            });
          } catch (err) { console.error(err); }
        }
        updateShareLinks();
      } else {
        // Edit it
        contentDiv.setAttribute('contenteditable', 'true');
        contentDiv.focus();
        editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        editBtn.classList.add('save');
      }
      return;
    }
    
    // Delete
    const deleteBtn = e.target.closest('.btn-action.delete');
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
      
      notes = notes.filter(n => n.part_id !== id);
      render();
    }
  });
}

loadNotes();
