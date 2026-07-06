const state = {
  contacts: [],
  stats: null,
  token: localStorage.getItem('contactTrackerAccessToken') || '',
  tokenRequired: false,
  activeToastTimer: null
};

const els = {
  systemBadge: document.getElementById('systemBadge'),
  menuToggle: document.getElementById('menuToggle'),
  navPanel: document.getElementById('navPanel'),
  navAddContact: document.getElementById('navAddContact'),
  navRefresh: document.getElementById('navRefresh'),
  navAccess: document.getElementById('navAccess'),
  addContactBtn: document.getElementById('addContactBtn'),
  contactsGrid: document.getElementById('contactsGrid'),
  emptyState: document.getElementById('emptyState'),
  resultSummary: document.getElementById('resultSummary'),
  searchInput: document.getElementById('searchInput'),
  sortSelect: document.getElementById('sortSelect'),
  statusFilter: document.getElementById('statusFilter'),
  priorityFilter: document.getElementById('priorityFilter'),
  cardSizeSelect: document.getElementById('cardSizeSelect'),
  statTotal: document.getElementById('statTotal'),
  statWatchlist: document.getElementById('statWatchlist'),
  statFollowup: document.getElementById('statFollowup'),
  statHigh: document.getElementById('statHigh'),
  contactModal: document.getElementById('contactModal'),
  viewModal: document.getElementById('viewModal'),
  accessModal: document.getElementById('accessModal'),
  contactForm: document.getElementById('contactForm'),
  modalTitle: document.getElementById('modalTitle'),
  closeContactModal: document.getElementById('closeContactModal'),
  closeViewModal: document.getElementById('closeViewModal'),
  closeAccessModal: document.getElementById('closeAccessModal'),
  cancelContactBtn: document.getElementById('cancelContactBtn'),
  saveContactBtn: document.getElementById('saveContactBtn'),
  contactId: document.getElementById('contactId'),
  avatarDataUrl: document.getElementById('avatarDataUrl'),
  avatarInput: document.getElementById('avatarInput'),
  avatarPreview: document.getElementById('avatarPreview'),
  clearAvatarBtn: document.getElementById('clearAvatarBtn'),
  nameInput: document.getElementById('nameInput'),
  titleInput: document.getElementById('titleInput'),
  companyInput: document.getElementById('companyInput'),
  locationInput: document.getElementById('locationInput'),
  emailInput: document.getElementById('emailInput'),
  phoneInput: document.getElementById('phoneInput'),
  statusInput: document.getElementById('statusInput'),
  priorityInput: document.getElementById('priorityInput'),
  lastContactedInput: document.getElementById('lastContactedInput'),
  nextFollowUpInput: document.getElementById('nextFollowUpInput'),
  websiteInput: document.getElementById('websiteInput'),
  socialLinksInput: document.getElementById('socialLinksInput'),
  tagsInput: document.getElementById('tagsInput'),
  notesInput: document.getElementById('notesInput'),
  expandedContact: document.getElementById('expandedContact'),
  accessTokenInput: document.getElementById('accessTokenInput'),
  saveAccessToken: document.getElementById('saveAccessToken'),
  clearAccessToken: document.getElementById('clearAccessToken'),
  toast: document.getElementById('toast')
};


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

function openModal(modal) {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function showToast(message, type = 'ok') {
  window.clearTimeout(state.activeToastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle('error', type === 'error');
  els.toast.classList.add('show');
  state.activeToastTimer = window.setTimeout(() => {
    els.toast.classList.remove('show');
  }, 3000);
}

function authHeaders() {
  if (!state.token) return {};
  return {
    Authorization: `Bearer ${state.token}`,
    'X-Admin-Token': state.token
  };
}

async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...authHeaders(),
    ...(options.headers || {})
  };

  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (response.status === 401) {
    state.tokenRequired = true;
    updateSystemBadge('LOCKED', 'locked');
    openAccessModal();
    throw new Error(data?.error || 'Access token required');
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data;
}

function updateSystemBadge(text, className = '') {
  els.systemBadge.textContent = text;
  els.systemBadge.className = `system-badge ${className}`.trim();
}

async function checkHealth() {
  try {
    const health = await fetch('/health').then((response) => response.json());
    state.tokenRequired = Boolean(health.tokenRequired);
    if (state.tokenRequired && !state.token) {
      updateSystemBadge('LOCKED', 'locked');
      openAccessModal();
    } else {
      updateSystemBadge(health.mongoState === 1 ? 'ONLINE' : 'SYNCING', health.mongoState === 1 ? 'online' : '');
    }
  } catch (_err) {
    updateSystemBadge('OFFLINE', 'locked');
  }
}

function getQueryParams() {
  const params = new URLSearchParams();
  const q = els.searchInput.value.trim();
  if (q) params.set('q', q);
  params.set('sort', els.sortSelect.value);
  params.set('status', els.statusFilter.value);
  params.set('priority', els.priorityFilter.value);
  return params.toString();
}

async function loadContacts() {
  try {
    const query = getQueryParams();
    const [contacts, stats] = await Promise.all([
      apiFetch(`/api/contacts${query ? `?${query}` : ''}`),
      apiFetch('/api/contacts/stats')
    ]);
    state.contacts = contacts;
    state.stats = stats;
    renderContacts();
    renderStats();
    updateSystemBadge('ONLINE', 'online');
  } catch (err) {
    renderContacts();
    showToast(err.message, 'error');
  }
}

function countBy(rows, key) {
  return (rows || []).find((row) => row._id === key)?.count || 0;
}

function renderStats() {
  const stats = state.stats || { total: 0, statuses: [], priorities: [] };
  els.statTotal.textContent = stats.total || 0;
  els.statWatchlist.textContent = countBy(stats.statuses, 'watchlist');
  els.statFollowup.textContent = countBy(stats.statuses, 'follow-up');
  els.statHigh.textContent = countBy(stats.priorities, 'high');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function avatarHtml(contact, className = 'avatar') {
  if (contact.avatarDataUrl) {
    return `<div class="${className}"><img src="${escapeHtml(contact.avatarDataUrl)}" alt="${escapeHtml(contact.name)} avatar" /></div>`;
  }
  return `<div class="${className}">${escapeHtml(initials(contact.name))}</div>`;
}

function trimText(value, length = 120) {
  const clean = String(value || '').trim();
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length - 1)}…`;
}

function hostLabel(url) {
  try {
    const parsed = new URL(url.startsWith('http') || url.startsWith('mailto:') ? url : `https://${url}`);
    if (parsed.protocol === 'mailto:') return 'Email';
    return parsed.hostname.replace(/^www\./, '').split('.')[0].replace(/^[a-z]/, (match) => match.toUpperCase());
  } catch (_err) {
    return 'Link';
  }
}

function contactSubtitle(contact) {
  const title = contact.title || '';
  const company = contact.company || '';
  if (title && company) return `${title} / ${company}`;
  return title || company || contact.location || 'No role saved';
}

function renderSocialChips(contact, limit = 4) {
  const links = contact.socialLinks || [];
  if (!links.length) return '<span class="detail-value">—</span>';
  return `<div class="social-links-mini">${links.slice(0, limit).map((link) => {
    const label = link.label || hostLabel(link.url);
    return `<a class="social-chip" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }).join('')}${links.length > limit ? `<span class="tag-chip">+${links.length - limit}</span>` : ''}</div>`;
}

function renderTags(contact, limit = 4) {
  const tags = contact.tags || [];
  if (!tags.length) return '<span class="detail-value">—</span>';
  return `<div class="tag-row">${tags.slice(0, limit).map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}${tags.length > limit ? `<span class="tag-chip">+${tags.length - limit}</span>` : ''}</div>`;
}

function renderContactCard(contact) {
  const statusClass = String(contact.status || '').replace(/[^a-z0-9-]/gi, '');
  const priorityClass = String(contact.priority || '').replace(/[^a-z0-9-]/gi, '');
  return `
    <article class="contact-card" data-id="${escapeHtml(contact.id)}">
      <div class="card-top">
        ${avatarHtml(contact)}
        <div class="contact-heading">
          <div class="contact-title-row">
            <h3 class="contact-name">${escapeHtml(contact.name)}</h3>
          </div>
          <p class="contact-meta">${escapeHtml(contactSubtitle(contact))}</p>
          <div class="card-badges">
            <span class="status-badge ${statusClass}">${escapeHtml(contact.status || 'active')}</span>
            <span class="priority-badge ${priorityClass}">${escapeHtml(contact.priority || 'medium')}</span>
          </div>
        </div>
      </div>
      <div class="contact-details">
        <div class="profile-detail"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml(contact.location || '—')}</span></div>
        <div class="profile-detail"><span class="detail-label">Socials</span>${renderSocialChips(contact)}</div>
        <div class="profile-detail"><span class="detail-label">Follow-up</span><span class="detail-value">${escapeHtml(formatDate(contact.nextFollowUpAt))}</span></div>
        <div class="profile-detail"><span class="detail-label">Tags</span>${renderTags(contact)}</div>
        <div class="profile-detail"><span class="detail-label">Notes</span><span class="detail-value notes">${escapeHtml(trimText(contact.notes || '—', 180))}</span></div>
      </div>
      <div class="divider"></div>
      <div class="profile-actions">
        <button type="button" data-action="view" data-id="${escapeHtml(contact.id)}">VIEW</button>
        <button type="button" class="primary" data-action="edit" data-id="${escapeHtml(contact.id)}">EDIT</button>
        <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(contact.id)}">DELETE</button>
      </div>
    </article>
  `;
}

function renderContacts() {
  els.contactsGrid.className = `profiles-grid size-${els.cardSizeSelect.value}`;
  const contacts = state.contacts || [];
  els.contactsGrid.innerHTML = contacts.map(renderContactCard).join('');
  els.emptyState.hidden = contacts.length > 0;
  els.resultSummary.textContent = contacts.length === 1 ? '1 contact displayed.' : `${contacts.length} contacts displayed.`;
}

function openAccessModal() {
  els.accessTokenInput.value = state.token || '';
  openModal(els.accessModal);
  window.setTimeout(() => els.accessTokenInput.focus(), 50);
}

function resetForm() {
  els.contactForm.reset();
  els.contactId.value = '';
  els.avatarDataUrl.value = '';
  els.avatarPreview.innerHTML = '?';
  els.statusInput.value = 'active';
  els.priorityInput.value = 'medium';
  els.modalTitle.textContent = 'New Contact';
  els.saveContactBtn.textContent = 'SAVE CONTACT';
}

function openCreateModal() {
  resetForm();
  openModal(els.contactModal);
  window.setTimeout(() => els.nameInput.focus(), 50);
}

function findContact(id) {
  return state.contacts.find((contact) => contact.id === id);
}

function populateForm(contact) {
  resetForm();
  els.contactId.value = contact.id;
  els.avatarDataUrl.value = contact.avatarDataUrl || '';
  renderAvatarPreview(contact.avatarDataUrl, contact.name);
  els.nameInput.value = contact.name || '';
  els.titleInput.value = contact.title || '';
  els.companyInput.value = contact.company || '';
  els.locationInput.value = contact.location || '';
  els.emailInput.value = contact.email || '';
  els.phoneInput.value = contact.phone || '';
  els.statusInput.value = contact.status || 'active';
  els.priorityInput.value = contact.priority || 'medium';
  els.lastContactedInput.value = toDateInput(contact.lastContactedAt);
  els.nextFollowUpInput.value = toDateInput(contact.nextFollowUpAt);
  els.websiteInput.value = contact.website || '';
  els.socialLinksInput.value = (contact.socialLinks || [])
    .map((link) => `${link.label ? `${link.label} | ` : ''}${link.url}`)
    .join('\n');
  els.tagsInput.value = (contact.tags || []).join(', ');
  els.notesInput.value = contact.notes || '';
  els.modalTitle.textContent = 'Edit Contact';
  els.saveContactBtn.textContent = 'UPDATE CONTACT';
}

function openEditModal(id) {
  const contact = findContact(id);
  if (!contact) return showToast('Contact not found.', 'error');
  populateForm(contact);
  openModal(els.contactModal);
}

function expandedDetail(label, value) {
  return `
    <div class="expanded-detail">
      <span class="expanded-label">${escapeHtml(label)}</span>
      <div class="expanded-value">${value || '—'}</div>
    </div>
  `;
}

function renderExpandedContact(contact) {
  const socialLinks = (contact.socialLinks || []).length
    ? `<div class="expanded-socials">${(contact.socialLinks || []).map((link) => {
        const label = link.label || hostLabel(link.url);
        return `<a class="social-chip" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
      }).join('')}</div>`
    : '—';
  const tags = (contact.tags || []).length ? renderTags(contact, 30) : '—';
  const website = contact.website ? `<a class="social-chip" href="${escapeHtml(contact.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(contact.website)}</a>` : '—';
  const email = contact.email ? `<a class="social-chip" href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : '—';

  els.expandedContact.innerHTML = `
    <section class="expanded-profile-card">
      <div class="expanded-header">
        ${avatarHtml(contact, 'expanded-avatar')}
        <div>
          <h3 class="expanded-name">${escapeHtml(contact.name)}</h3>
          <p class="expanded-subtitle">${escapeHtml(contactSubtitle(contact))}</p>
          <div class="card-badges">
            <span class="status-badge ${escapeHtml(contact.status)}">${escapeHtml(contact.status)}</span>
            <span class="priority-badge ${escapeHtml(contact.priority)}">${escapeHtml(contact.priority)}</span>
          </div>
        </div>
      </div>
      <div class="expanded-details">
        ${expandedDetail('Location', escapeHtml(contact.location || '—'))}
        ${expandedDetail('Phone', escapeHtml(contact.phone || '—'))}
        ${expandedDetail('Email', email)}
        ${expandedDetail('Website', website)}
        ${expandedDetail('Last Contacted', escapeHtml(formatDate(contact.lastContactedAt)))}
        ${expandedDetail('Next Follow-up', escapeHtml(formatDate(contact.nextFollowUpAt)))}
        ${expandedDetail('Social Links', socialLinks)}
        ${expandedDetail('Tags', tags)}
      </div>
      <div class="expanded-detail">
        <span class="expanded-label">Notes</span>
        <div class="expanded-value expanded-notes">${escapeHtml(contact.notes || '—')}</div>
      </div>
      <div class="expanded-actions">
        <button type="button" class="primary" data-view-action="edit" data-id="${escapeHtml(contact.id)}">EDIT CONTACT</button>
        <button type="button" class="danger" data-view-action="delete" data-id="${escapeHtml(contact.id)}">DELETE CONTACT</button>
      </div>
    </section>
  `;
}

function openViewModal(id) {
  const contact = findContact(id);
  if (!contact) return showToast('Contact not found.', 'error');
  renderExpandedContact(contact);
  openModal(els.viewModal);
}

function parseListInput(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrlInput(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean) || /^mailto:/i.test(clean)) return clean;
  return `https://${clean}`;
}

function parseSocialLinks(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (!line.includes('|')) {
        const url = normalizeUrlInput(line);
        return { label: hostLabel(url), url };
      }
      const [label, ...rest] = line.split('|');
      const url = normalizeUrlInput(rest.join('|'));
      return { label: label.trim() || hostLabel(url), url };
    })
    .filter((link) => link.url);
}

function formPayload() {
  return {
    name: els.nameInput.value.trim(),
    title: els.titleInput.value.trim(),
    company: els.companyInput.value.trim(),
    location: els.locationInput.value.trim(),
    email: els.emailInput.value.trim(),
    phone: els.phoneInput.value.trim(),
    status: els.statusInput.value,
    priority: els.priorityInput.value,
    lastContactedAt: els.lastContactedInput.value || null,
    nextFollowUpAt: els.nextFollowUpInput.value || null,
    website: normalizeUrlInput(els.websiteInput.value),
    socialLinks: parseSocialLinks(els.socialLinksInput.value),
    tags: parseListInput(els.tagsInput.value),
    notes: els.notesInput.value.trim(),
    avatarDataUrl: els.avatarDataUrl.value.trim()
  };
}

async function saveContact(event) {
  event.preventDefault();
  const payload = formPayload();
  if (!payload.name) return showToast('Name is required.', 'error');

  const id = els.contactId.value;
  const method = id ? 'PUT' : 'POST';
  const path = id ? `/api/contacts/${encodeURIComponent(id)}` : '/api/contacts';
  els.saveContactBtn.disabled = true;

  try {
    await apiFetch(path, {
      method,
      body: JSON.stringify(payload)
    });
    closeModal(els.contactModal);
    showToast(id ? 'Contact updated.' : 'Contact saved.');
    await loadContacts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.saveContactBtn.disabled = false;
  }
}

async function deleteContact(id) {
  const contact = findContact(id);
  const name = contact?.name || 'this contact';
  if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;

  try {
    await apiFetch(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    closeModal(els.viewModal);
    showToast('Contact deleted.');
    await loadContacts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAvatarPreview(dataUrl, name = '') {
  if (dataUrl) {
    els.avatarPreview.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Avatar preview" />`;
  } else {
    els.avatarPreview.textContent = initials(name || els.nameInput.value || '?');
  }
}

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not load image.'));
      image.onload = () => {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleAvatarChange(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    const dataUrl = await resizeImageToDataUrl(file);
    els.avatarDataUrl.value = dataUrl;
    renderAvatarPreview(dataUrl);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.avatarInput.value = '';
  }
}

function closeAllModals() {
  closeModal(els.contactModal);
  closeModal(els.viewModal);
  closeModal(els.accessModal);
}

function wireEvents() {
  const reloadDebounced = debounce(loadContacts, 250);

  els.menuToggle.addEventListener('click', () => {
    const open = els.navPanel.classList.toggle('open');
    els.menuToggle.setAttribute('aria-expanded', String(open));
    els.navPanel.setAttribute('aria-hidden', String(!open));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav-dropdown')) {
      els.navPanel.classList.remove('open');
      els.menuToggle.setAttribute('aria-expanded', 'false');
      els.navPanel.setAttribute('aria-hidden', 'true');
    }
  });

  els.navAddContact.addEventListener('click', openCreateModal);
  els.addContactBtn.addEventListener('click', openCreateModal);
  els.navRefresh.addEventListener('click', loadContacts);
  els.navAccess.addEventListener('click', openAccessModal);

  els.searchInput.addEventListener('input', reloadDebounced);
  els.sortSelect.addEventListener('change', loadContacts);
  els.statusFilter.addEventListener('change', loadContacts);
  els.priorityFilter.addEventListener('change', loadContacts);
  els.cardSizeSelect.addEventListener('change', renderContacts);

  els.closeContactModal.addEventListener('click', () => closeModal(els.contactModal));
  els.closeViewModal.addEventListener('click', () => closeModal(els.viewModal));
  els.closeAccessModal.addEventListener('click', () => closeModal(els.accessModal));
  els.cancelContactBtn.addEventListener('click', () => closeModal(els.contactModal));
  els.contactForm.addEventListener('submit', saveContact);

  els.avatarInput.addEventListener('change', handleAvatarChange);
  els.clearAvatarBtn.addEventListener('click', () => {
    els.avatarDataUrl.value = '';
    renderAvatarPreview('', els.nameInput.value);
  });
  els.nameInput.addEventListener('input', () => {
    if (!els.avatarDataUrl.value) renderAvatarPreview('', els.nameInput.value);
  });

  els.contactsGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'view') openViewModal(id);
    if (action === 'edit') openEditModal(id);
    if (action === 'delete') deleteContact(id);
  });

  els.contactsGrid.addEventListener('dblclick', (event) => {
    if (event.target.closest('button, a, input, select, textarea')) return;
    const card = event.target.closest('.contact-card');
    if (!card?.dataset?.id) return;
    openViewModal(card.dataset.id);
  });

  els.expandedContact.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view-action]');
    if (!button) return;
    const { viewAction, id } = button.dataset;
    if (viewAction === 'edit') {
      closeModal(els.viewModal);
      openEditModal(id);
    }
    if (viewAction === 'delete') deleteContact(id);
  });

  els.saveAccessToken.addEventListener('click', async () => {
    state.token = els.accessTokenInput.value.trim();
    if (state.token) localStorage.setItem('contactTrackerAccessToken', state.token);
    closeModal(els.accessModal);
    await loadContacts();
  });

  els.clearAccessToken.addEventListener('click', () => {
    state.token = '';
    localStorage.removeItem('contactTrackerAccessToken');
    els.accessTokenInput.value = '';
    showToast('Access token cleared.');
    if (state.tokenRequired) openAccessModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllModals();
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });
}

async function init() {
  wireEvents();
  await checkHealth();
  if (!state.tokenRequired || state.token) await loadContacts();
}

init();
