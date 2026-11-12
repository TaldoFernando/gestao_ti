const STORAGE_KEY = 'ti-prefeitura-inventario-v1';
const starterData = {
  sectors: [
    { id: 'setor-educacao', name: 'Secretaria de Educação', type: 'Secretaria', description: '' },
    { id: 'setor-saude', name: 'Unidade de Saúde Central', type: 'Unidade de saúde', description: '' },
    { id: 'setor-administracao', name: 'Secretaria de Administração', type: 'Secretaria', description: '' },
  ],
  equipment: [
    { id: 'equip-1', name: 'Computador Dell OptiPlex', type: 'Computador', assetTag: 'PAT-00125', serial: 'DL-7K2A91', sectorId: 'setor-educacao' },
    { id: 'equip-2', name: 'Monitor Dell 24 polegadas', type: 'Monitor', assetTag: 'PAT-00126', serial: 'MN-23901', sectorId: 'setor-educacao' },
    { id: 'equip-3', name: 'Impressora HP LaserJet', type: 'Impressora', assetTag: 'PAT-00201', serial: 'HP-LJ-5512', sectorId: 'setor-saude' },
    { id: 'equip-4', name: 'Notebook Lenovo ThinkPad', type: 'Notebook', assetTag: 'PAT-00311', serial: 'LN-8840Q', sectorId: 'setor-administracao' },
  ],
};

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(starterData);
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.sectors) || !Array.isArray(parsed.equipment)) throw new Error('Invalid inventory');
    return parsed;
  } catch {
    return structuredClone(starterData);
  }
}

let data = loadData();
let pendingDelete = null;
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const sectorById = (id) => data.sectors.find((sector) => sector.id === id);
const saveData = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function renderSummary() {
  const types = new Set(data.equipment.map((item) => item.type.trim().toLocaleLowerCase('pt-BR')));
  $('#total-equipment').textContent = data.equipment.length;
  $('#total-sectors').textContent = data.sectors.length;
  $('#total-types').textContent = types.size;
  $('#unassigned-equipment').textContent = data.equipment.filter((item) => !sectorById(item.sectorId)).length;
  const allSectors = [...data.sectors.map((sector) => ({ ...sector, count: data.equipment.filter((item) => item.sectorId === sector.id).length })), { id: '', name: 'Sem setor definido', type: 'Pendente', count: data.equipment.filter((item) => !sectorById(item.sectorId)).length }];
  const maxCount = Math.max(1, ...allSectors.map((sector) => sector.count));
  $('#sector-summary').innerHTML = allSectors.length ? allSectors.map((sector) => `
    <article class="summary-row"><div class="summary-label"><span><strong>${escapeHTML(sector.name)}</strong><small>${escapeHTML(sector.type)}</small></span><b>${sector.count}</b></div><div class="sector-bar"><i style="width:${Math.max(sector.count ? 7 : 0, (sector.count / maxCount) * 100)}%"></i></div><small class="summary-caption">${sector.count} ${sector.count === 1 ? 'equipamento' : 'equipamentos'}</small></article>`).join('') : '<p class="muted">Cadastre um setor para começar a organizar o patrimônio.</p>';
}

function renderSelects() {
  const selectedSector = $('#sector-filter').value;
  const selectedType = $('#type-filter').value;
  const sectorOptions = data.sectors.map((sector) => `<option value="${escapeHTML(sector.id)}">${escapeHTML(sector.name)}</option>`).join('');
  $('#sector-filter').innerHTML = `<option value="">Todos os setores</option>${sectorOptions}`;
  $('#equipment-sector').innerHTML = `<option value="">Sem setor definido</option>${sectorOptions}`;
  $('#sector-filter').value = data.sectors.some((sector) => sector.id === selectedSector) ? selectedSector : '';
  const types = [...new Set(data.equipment.map((item) => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('#type-filter').innerHTML = `<option value="">Todos os tipos</option>${types.map((type) => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join('')}`;
  $('#type-filter').value = types.includes(selectedType) ? selectedType : '';
  $('#equipment-types').innerHTML = types.map((type) => `<option value="${escapeHTML(type)}">`).join('');
}

function renderEquipment() {
  const search = $('#equipment-search').value.trim().toLocaleLowerCase('pt-BR');
  const sectorId = $('#sector-filter').value;
  const type = $('#type-filter').value;
  const filtered = data.equipment.filter((item) => {
    const sector = sectorById(item.sectorId);
    const searchable = [item.name, item.type, item.assetTag, item.serial, sector?.name].join(' ').toLocaleLowerCase('pt-BR');
    return searchable.includes(search) && (!sectorId || item.sectorId === sectorId) && (!type || item.type === type);
  });
  $('#equipment-rows').innerHTML = filtered.map((item) => `
    <tr><td><strong>${escapeHTML(item.name)}</strong></td><td><span class="type-chip">${escapeHTML(item.type)}</span></td><td>${escapeHTML(item.assetTag || '—')}</td><td>${escapeHTML(item.serial || '—')}</td><td>${escapeHTML(sectorById(item.sectorId)?.name || 'Sem setor')}</td><td><button class="row-action" type="button" data-delete-equipment="${escapeHTML(item.id)}" aria-label="Excluir ${escapeHTML(item.name)}" title="Excluir">×</button></td></tr>`).join('');
  $('#equipment-empty').hidden = filtered.length > 0;
}

function renderSectors() {
  $('#sector-cards').innerHTML = data.sectors.length ? data.sectors.map((sector) => {
    const count = data.equipment.filter((item) => item.sectorId === sector.id).length;
    const equipmentTypes = [...new Set(data.equipment.filter((item) => item.sectorId === sector.id).map((item) => item.type))];
    const typeSummary = equipmentTypes.length ? equipmentTypes.map((type) => `<span class="type-chip">${escapeHTML(type)} · ${data.equipment.filter((item) => item.sectorId === sector.id && item.type === type).length}</span>`).join('') : '<small class="muted">Nenhum equipamento alocado</small>';
    return `<article class="sector-card"><div class="sector-card-heading"><span class="sector-icon">⌖</span><button class="row-action" type="button" data-delete-sector="${escapeHTML(sector.id)}" aria-label="Excluir ${escapeHTML(sector.name)}" title="Excluir setor">×</button></div><span class="sector-type">${escapeHTML(sector.type)}</span><h3>${escapeHTML(sector.name)}</h3><p class="sector-description">${escapeHTML(sector.description || 'Sem descrição')}</p><div class="sector-card-count"><strong>${count}</strong><span>${count === 1 ? 'equipamento' : 'equipamentos'}</span></div><div class="sector-card-types">${typeSummary}</div></article>`;
  }).join('') : '<div class="empty-state"><span>⌖</span><strong>Nenhum setor cadastrado</strong><p>Cadastre os setores da prefeitura para alocar os equipamentos.</p></div>';
}

function render() {
  renderSummary();
  renderSelects();
  renderEquipment();
  renderSectors();
}

function switchView(view) {
  const titles = { inicio: ['Visão geral', 'Controle de equipamentos', 'Visualize os equipamentos cadastrados e sua distribuição pelos setores.'], equipamentos: ['Equipamentos', 'Equipamentos', 'Pesquise e gerencie os equipamentos cadastrados no patrimônio.'], setores: ['Setores', 'Setores', 'Cadastre os locais e acompanhe os equipamentos alocados em cada um.'] };
  const [breadcrumb, title, subtitle] = titles[view] || titles.inicio;
  $('#breadcrumb-title').textContent = breadcrumb;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $('#summary-panel').hidden = view !== 'inicio';
  $('#equipment-panel').hidden = view === 'setores';
  $('#sectors-panel').hidden = view === 'equipamentos';
  $('#add-equipment').hidden = view === 'setores';
  if (view === 'equipamentos') $('#equipment-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (view === 'setores') $('#sectors-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function openEquipmentDialog() {
  $('#equipment-form').reset();
  $('#equipment-dialog').showModal();
  $('#equipment-form').elements.name.focus();
}

function openSectorDialog() {
  $('#sector-form').reset();
  $('#sector-dialog').showModal();
  $('#sector-form').elements.name.focus();
}

function askDelete(type, id) {
  const equipment = data.equipment.find((item) => item.id === id);
  const sector = data.sectors.find((item) => item.id === id);
  pendingDelete = { type, id };
  $('#confirm-message').textContent = type === 'equipment'
    ? `O equipamento “${equipment?.name || ''}” será removido do cadastro.`
    : `O setor “${sector?.name || ''}” será excluído. Os equipamentos alocados nele ficarão sem setor.`;
  $('#confirm-dialog').showModal();
}

document.querySelectorAll('.nav-item, [data-view="setores"]').forEach((link) => link.addEventListener('click', (event) => {
  const view = link.dataset.view;
  if (!view) return;
  event.preventDefault();
  history.replaceState(null, '', `#${view}`);
  switchView(view);
}));

$('#add-equipment').addEventListener('click', openEquipmentDialog);
$('#manage-sectors').addEventListener('click', openSectorDialog);
$('#add-sector').addEventListener('click', openSectorDialog);
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
['input', 'change'].forEach((eventName) => {
  $('#equipment-search').addEventListener(eventName, renderEquipment);
  $('#sector-filter').addEventListener(eventName, renderEquipment);
  $('#type-filter').addEventListener(eventName, renderEquipment);
});

$('#equipment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  data.equipment.unshift({ id: makeId('equip'), name: fields.get('name').trim(), type: fields.get('type').trim(), assetTag: fields.get('assetTag').trim(), serial: fields.get('serial').trim(), sectorId: fields.get('sectorId') });
  saveData();
  render();
  $('#equipment-dialog').close();
  showToast('Equipamento cadastrado.');
});

$('#sector-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const name = fields.get('name').trim();
  if (data.sectors.some((sector) => sector.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    showToast('Já existe um setor com esse nome.');
    return;
  }
  data.sectors.push({ id: makeId('setor'), name, type: fields.get('type').trim(), description: fields.get('description').trim() });
  saveData();
  render();
  $('#sector-dialog').close();
  showToast('Setor cadastrado.');
});

document.addEventListener('click', (event) => {
  const equipmentButton = event.target.closest('[data-delete-equipment]');
  const sectorButton = event.target.closest('[data-delete-sector]');
  if (equipmentButton) askDelete('equipment', equipmentButton.dataset.deleteEquipment);
  if (sectorButton) askDelete('sector', sectorButton.dataset.deleteSector);
});

$('#confirm-dialog').addEventListener('close', () => {
  if ($('#confirm-dialog').returnValue !== 'confirm' || !pendingDelete) return;
  if (pendingDelete.type === 'equipment') data.equipment = data.equipment.filter((item) => item.id !== pendingDelete.id);
  else data.sectors = data.sectors.filter((sector) => sector.id !== pendingDelete.id);
  saveData();
  render();
  showToast(pendingDelete.type === 'equipment' ? 'Equipamento removido.' : 'Setor removido.');
  pendingDelete = null;
});

window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
render();
switchView(location.hash.slice(1) || 'inicio');
