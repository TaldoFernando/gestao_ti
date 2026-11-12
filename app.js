const STORAGE_KEY = 'ti-prefeitura-inventario-v1';
const defaultEquipmentTypes = ['Computador', 'Notebook', 'Monitor', 'Impressora', 'Roteador', 'Switch', 'Nobreak', 'Telefone', 'Projetor', 'Scanner', 'Servidor'];
const starterData = {
  sectors: [
    { id: 'setor-educacao', name: 'Secretaria Municipal de Educação', type: 'Secretaria', description: '', parentId: null },
    { id: 'escola-central', name: 'Escola Municipal Central', type: 'Escola', description: '', parentId: 'setor-educacao' },
    { id: 'setor-saude', name: 'Secretaria Municipal de Saúde', type: 'Secretaria', description: '', parentId: null },
    { id: 'ubs-central', name: 'UBS Central', type: 'Unidade de saúde', description: '', parentId: 'setor-saude' },
    { id: 'hospital-municipal', name: 'Hospital Municipal', type: 'Hospital', description: '', parentId: 'setor-saude' },
    { id: 'setor-administracao', name: 'Secretaria de Administração', type: 'Secretaria', description: '', parentId: null },
  ],
  equipment: [
    { id: 'equip-1', name: 'Computador Dell OptiPlex', type: 'Computador', assetTag: 'PAT-00125', serial: 'DL-7K2A91', sectorId: 'escola-central' },
    { id: 'equip-2', name: 'Monitor Dell 24 polegadas', type: 'Monitor', assetTag: 'PAT-00126', serial: 'MN-23901', sectorId: 'escola-central' },
    { id: 'equip-3', name: 'Impressora HP LaserJet', type: 'Impressora', assetTag: 'PAT-00201', serial: 'HP-LJ-5512', sectorId: 'ubs-central' },
    { id: 'equip-4', name: 'Notebook Lenovo ThinkPad', type: 'Notebook', assetTag: 'PAT-00311', serial: 'LN-8840Q', sectorId: 'setor-administracao' },
  ],
  equipmentTypes: [...defaultEquipmentTypes],
};

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(starterData);
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.sectors) || !Array.isArray(parsed.equipment)) throw new Error('Invalid inventory');
    parsed.sectors = parsed.sectors.map((sector) => ({ ...sector, parentId: sector.parentId || null }));
    const savedTypes = Array.isArray(parsed.equipmentTypes) ? parsed.equipmentTypes : [];
    parsed.equipmentTypes = [...new Map([...defaultEquipmentTypes, ...savedTypes, ...parsed.equipment.map((item) => item.type).filter(Boolean)].map((type) => [type.toLocaleLowerCase('pt-BR'), type])).values()];
    return parsed;
  } catch {
    return structuredClone(starterData);
  }
}

let data = loadData();
let pendingDelete = null;
let editingEquipmentId = null;
let openSectorId = null;
let isEditingFromSector = false;
let expandedSectorGroupId = null;
const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const sectorById = (id) => data.sectors.find((sector) => sector.id === id);
const childrenOf = (id) => data.sectors.filter((sector) => sector.parentId === id);
const rootSector = (sector) => sector?.parentId ? sectorById(sector.parentId) : sector;
const sectorPath = (sector) => sector?.parentId ? `${rootSector(sector)?.name || ''} › ${sector.name}` : sector?.name || '';
const sectorEquipment = (sector) => {
  const ids = new Set([sector.id, ...childrenOf(sector.id).map((child) => child.id)]);
  return data.equipment.filter((item) => ids.has(item.sectorId));
};
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
  const allSectors = [...data.sectors.filter((sector) => !sector.parentId).map((sector) => ({ ...sector, count: sectorEquipment(sector).length, childCount: childrenOf(sector.id).length })), { id: '', name: 'Sem local definido', type: 'Pendente', count: data.equipment.filter((item) => !sectorById(item.sectorId)).length, childCount: 0 }];
  const maxCount = Math.max(1, ...allSectors.map((sector) => sector.count));
  $('#sector-summary').innerHTML = allSectors.length ? allSectors.map((sector) => `
    <article class="summary-row"><div class="summary-label"><span><strong>${escapeHTML(sector.name)}</strong><small>${escapeHTML(sector.type)}${sector.childCount ? ` · ${sector.childCount} locais vinculados` : ''}</small></span><b>${sector.count}</b></div><div class="sector-bar"><i style="width:${Math.max(sector.count ? 7 : 0, (sector.count / maxCount) * 100)}%"></i></div><small class="summary-caption">${sector.count} ${sector.count === 1 ? 'equipamento' : 'equipamentos'}</small></article>`).join('') : '<p class="muted">Cadastre um setor para começar a organizar o patrimônio.</p>';
}

function renderSelects() {
  const selectedSector = $('#sector-filter').value;
  const selectedType = $('#type-filter').value;
  const selectedEquipmentType = $('#equipment-type').value;
  const orderedSectors = data.sectors.filter((sector) => !sector.parentId).flatMap((sector) => [sector, ...childrenOf(sector.id)]);
  const sectorOptions = orderedSectors.map((sector) => `<option value="${escapeHTML(sector.id)}">${sector.parentId ? '↳ ' : ''}${escapeHTML(sector.name)}${sector.parentId ? ` (${escapeHTML(rootSector(sector)?.name || '')})` : ''}</option>`).join('');
  $('#sector-filter').innerHTML = `<option value="">Todos os locais</option>${sectorOptions}`;
  $('#equipment-sector').innerHTML = `<option value="">Sem setor definido</option>${sectorOptions}`;
  $('#sector-parent').innerHTML = `<option value="">Nenhum — cadastrar como setor principal</option>${data.sectors.filter((sector) => !sector.parentId).map((sector) => `<option value="${escapeHTML(sector.id)}">${escapeHTML(sector.name)}</option>`).join('')}`;
  $('#sector-filter').value = data.sectors.some((sector) => sector.id === selectedSector) ? selectedSector : '';
  const types = [...new Set([...data.equipmentTypes, ...data.equipment.map((item) => item.type).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('#type-filter').innerHTML = `<option value="">Todos os tipos</option>${types.map((type) => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join('')}`;
  $('#type-filter').value = types.includes(selectedType) ? selectedType : '';
  $('#equipment-type').innerHTML = `<option value="">Selecione um tipo</option>${types.map((type) => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join('')}`;
  $('#equipment-type').value = types.includes(selectedEquipmentType) ? selectedEquipmentType : '';
  renderSectorPicker($('#equipment-sector').value);
}

function renderSectorPicker(selectedId = '') {
  const selectedSector = sectorById(selectedId);
  $('#sector-picker-label').textContent = selectedSector ? sectorPath(selectedSector) : 'Sem setor definido';
  const roots = data.sectors.filter((sector) => !sector.parentId);
  const groups = roots.map((sector) => {
    const children = childrenOf(sector.id);
    const expanded = expandedSectorGroupId === sector.id;
    const childOptions = children.map((child) => `<button class="picker-child ${selectedId === child.id ? 'selected' : ''}" type="button" data-select-sector="${escapeHTML(child.id)}"><span class="picker-child-mark">↳</span><span>${escapeHTML(child.name)}<small>${escapeHTML(child.type)}</small></span></button>`).join('');
    return `<div class="picker-group"><div class="picker-root-row"><button class="picker-root-choice ${selectedId === sector.id ? 'selected' : ''}" type="button" data-select-sector="${escapeHTML(sector.id)}"><span class="picker-building">⌂</span><span>${escapeHTML(sector.name)}<small>${escapeHTML(sector.type)}</small></span></button>${children.length ? `<button class="picker-expand" type="button" data-expand-sector="${escapeHTML(sector.id)}" aria-expanded="${expanded}">${expanded ? 'Fechar' : 'Abrir'} <span>${expanded ? '⌃' : '⌄'}</span></button>` : ''}</div>${children.length ? `<div class="picker-children" ${expanded ? '' : 'hidden'}>${childOptions}</div>` : ''}</div>`;
  }).join('');
  $('#sector-picker-options').innerHTML = `<button class="picker-unassigned ${selectedId ? '' : 'selected'}" type="button" data-select-sector="">Sem setor definido</button>${groups || '<p class="muted picker-empty">Cadastre um setor para poder alocar equipamentos.</p>'}`;
}

function renderEquipment() {
  const search = $('#equipment-search').value.trim().toLocaleLowerCase('pt-BR');
  const sectorId = $('#sector-filter').value;
  const type = $('#type-filter').value;
  const filtered = data.equipment.filter((item) => {
    const sector = sectorById(item.sectorId);
    const searchable = [item.name, item.type, item.assetTag, item.serial, sectorPath(sector)].join(' ').toLocaleLowerCase('pt-BR');
    const matchingSector = !sectorId || item.sectorId === sectorId || childrenOf(sectorId).some((child) => child.id === item.sectorId);
    return searchable.includes(search) && matchingSector && (!type || item.type === type);
  });
  $('#equipment-rows').innerHTML = filtered.map((item) => `
    <tr><td><strong>${escapeHTML(item.name)}</strong></td><td><span class="type-chip">${escapeHTML(item.type)}</span></td><td>${escapeHTML(item.assetTag || '—')}</td><td>${escapeHTML(item.serial || '—')}</td><td>${escapeHTML(sectorPath(sectorById(item.sectorId)) || 'Sem local')}</td><td><div class="row-actions"><button class="row-action edit-action" type="button" data-edit-equipment="${escapeHTML(item.id)}" aria-label="Editar ${escapeHTML(item.name)}" title="Editar">✎</button><button class="row-action" type="button" data-delete-equipment="${escapeHTML(item.id)}" aria-label="Excluir ${escapeHTML(item.name)}" title="Excluir">×</button></div></td></tr>`).join('');
  $('#equipment-empty').hidden = filtered.length > 0;
}

function renderSectors() {
  const roots = data.sectors.filter((sector) => !sector.parentId);
  $('#sector-cards').innerHTML = roots.length ? roots.map((sector) => {
    const children = childrenOf(sector.id);
    const equipment = sectorEquipment(sector);
    const equipmentTypes = [...new Set(equipment.map((item) => item.type))];
    const typeSummary = equipmentTypes.length ? equipmentTypes.map((type) => `<span class="type-chip">${escapeHTML(type)} · ${equipment.filter((item) => item.type === type).length}</span>`).join('') : '<small class="muted">Nenhum equipamento alocado</small>';
    const childCards = children.map((child) => {
      const childEquipment = data.equipment.filter((item) => item.sectorId === child.id);
      return `<article class="location-card"><div><span class="sector-type">${escapeHTML(child.type)}</span><h4>${escapeHTML(child.name)}</h4><small>${childEquipment.length} ${childEquipment.length === 1 ? 'equipamento' : 'equipamentos'}</small></div><div class="location-actions"><button class="text-button" type="button" data-open-sector="${escapeHTML(child.id)}">Abrir local →</button><button class="row-action" type="button" data-delete-sector="${escapeHTML(child.id)}" aria-label="Excluir ${escapeHTML(child.name)}" title="Excluir local">×</button></div></article>`;
    }).join('');
    return `<article class="sector-group"><div class="sector-group-heading"><div><span class="sector-type">${escapeHTML(sector.type)} · SETOR PRINCIPAL</span><h3>${escapeHTML(sector.name)}</h3><p>${children.length} ${children.length === 1 ? 'local vinculado' : 'locais vinculados'} · ${equipment.length} ${equipment.length === 1 ? 'equipamento' : 'equipamentos'} no total</p></div><div class="sector-group-actions"><button class="text-button" type="button" data-open-sector="${escapeHTML(sector.id)}">Ver resumo →</button><button class="row-action" type="button" data-delete-sector="${escapeHTML(sector.id)}" aria-label="Excluir ${escapeHTML(sector.name)}" title="Excluir setor">×</button></div></div><div class="sector-card-types">${typeSummary}</div><div class="location-list">${childCards || '<p class="muted">Nenhuma escola, hospital ou unidade vinculada.</p>'}</div><button class="sector-open-button" type="button" data-add-location="${escapeHTML(sector.id)}">＋ Adicionar setor agrupado</button></article>`;
  }).join('') : '<div class="empty-state"><span>⌖</span><strong>Nenhum setor cadastrado</strong><p>Cadastre um setor principal para começar.</p></div>';
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

function openEquipmentDialog(equipmentId = null) {
  $('#equipment-form').reset();
  expandedSectorGroupId = null;
  $('#sector-picker-options').hidden = true;
  $('#sector-picker-toggle').setAttribute('aria-expanded', 'false');
  editingEquipmentId = equipmentId;
  if (equipmentId) {
    const item = data.equipment.find((equipment) => equipment.id === equipmentId);
    if (!item) return;
    const form = $('#equipment-form');
    for (const field of ['name', 'type', 'assetTag', 'serial', 'sectorId']) form.elements[field].value = item[field] || '';
    renderSectorPicker(item.sectorId || '');
    $('#equipment-dialog-title').textContent = 'Editar equipamento';
    $('#save-equipment').textContent = 'Salvar alterações';
  } else {
    renderSectorPicker('');
    $('#equipment-dialog-title').textContent = 'Cadastrar equipamento';
    $('#save-equipment').textContent = 'Salvar equipamento';
  }
  $('#equipment-dialog').showModal();
  $('#equipment-form').elements.name.focus();
}

function showSectorDetails(sectorId) {
  const sector = sectorById(sectorId);
  if (!sector) return;
  openSectorId = sectorId;
  const equipment = sectorEquipment(sector);
  const types = new Map();
  equipment.forEach((item) => types.set(item.type, (types.get(item.type) || 0) + 1));
  const children = childrenOf(sectorId);
  $('#detail-sector-name').textContent = sector.name;
  $('#detail-sector-type').textContent = sector.parentId ? `${rootSector(sector)?.name || 'Setor'} › ${sector.type}` : `${sector.type}${children.length ? ` · ${children.length} locais vinculados` : ''}`;
  $('#detail-sector-description').textContent = sector.description || 'Sem descrição cadastrada';
  $('#detail-sector-stats').innerHTML = `<div><strong>${equipment.length}</strong><span>equipamentos</span></div><div><strong>${types.size}</strong><span>tipos diferentes</span></div>${!sector.parentId && children.length ? `<div><strong>${children.length}</strong><span>locais</span></div>` : ''}`;
  $('#detail-equipment-rows').innerHTML = equipment.map((item) => `<tr><td><strong>${escapeHTML(item.name)}</strong></td><td><span class="type-chip">${escapeHTML(item.type)}</span></td><td>${escapeHTML(sectorById(item.sectorId)?.name || 'Sem local')}</td><td>${escapeHTML(item.assetTag || '—')}</td><td>${escapeHTML(item.serial || '—')}</td><td><button class="row-action edit-action" type="button" data-edit-equipment="${escapeHTML(item.id)}" aria-label="Editar ${escapeHTML(item.name)}" title="Editar">✎</button></td></tr>`).join('');
  $('#detail-equipment-empty').hidden = equipment.length > 0;
  $('#sector-detail-dialog').showModal();
}

function openSectorDialog(parentId = '') {
  $('#sector-form').reset();
  renderSelects();
  $('#sector-parent').value = parentId;
  $('#sector-dialog-title').textContent = parentId ? 'Cadastrar local vinculado' : 'Cadastrar setor principal';
  $('#sector-dialog-description').textContent = parentId ? `Este local ficará dentro de ${sectorById(parentId)?.name || 'um setor principal'}.` : 'Crie um setor da prefeitura; depois poderá vincular escolas, hospitais e unidades a ele.';
  $('#sector-dialog').showModal();
  $('#sector-form').elements.name.focus();
}

function askDelete(type, id) {
  const equipment = data.equipment.find((item) => item.id === id);
  const sector = data.sectors.find((item) => item.id === id);
  if (type === 'sector' && childrenOf(id).length) {
    showToast('Remova ou transfira os locais vinculados antes de excluir este setor principal.');
    return;
  }
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
  const updated = { name: fields.get('name').trim(), type: fields.get('type').trim(), assetTag: fields.get('assetTag').trim(), serial: fields.get('serial').trim(), sectorId: fields.get('sectorId') };
  if (editingEquipmentId) {
    const item = data.equipment.find((equipment) => equipment.id === editingEquipmentId);
    Object.assign(item, updated);
  } else {
    data.equipment.unshift({ id: makeId('equip'), ...updated });
  }
  saveData();
  render();
  $('#equipment-dialog').close();
  if (openSectorId) showSectorDetails(openSectorId);
  showToast(editingEquipmentId ? 'Equipamento atualizado.' : 'Equipamento cadastrado.');
  editingEquipmentId = null;
});

$('#sector-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const name = fields.get('name').trim();
  const parentId = fields.get('parentId') || null;
  if (parentId && !sectorById(parentId)) {
    showToast('Selecione um setor principal válido.');
    return;
  }
  if (data.sectors.some((sector) => sector.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR') && sector.parentId === parentId)) {
    showToast('Já existe um setor com esse nome.');
    return;
  }
  data.sectors.push({ id: makeId(parentId ? 'local' : 'setor'), name, type: fields.get('type').trim(), description: fields.get('description').trim(), parentId });
  saveData();
  render();
  $('#sector-dialog').close();
  showToast('Setor cadastrado.');
});

document.addEventListener('click', (event) => {
  if (event.target.closest('#add-equipment-type')) {
    $('#equipment-type-form').reset();
    $('#equipment-type-dialog').showModal();
    $('#equipment-type-form').elements.type.focus();
    return;
  }
  if (event.target.closest('#sector-picker-toggle')) {
    const menu = $('#sector-picker-options');
    const willOpen = menu.hidden;
    expandedSectorGroupId = null;
    renderSectorPicker($('#equipment-sector').value);
    menu.hidden = !willOpen;
    $('#sector-picker-toggle').setAttribute('aria-expanded', String(willOpen));
    return;
  }
  const expandGroup = event.target.closest('[data-expand-sector]');
  if (expandGroup) {
    expandedSectorGroupId = expandedSectorGroupId === expandGroup.dataset.expandSector ? null : expandGroup.dataset.expandSector;
    renderSectorPicker($('#equipment-sector').value);
    return;
  }
  const selectedLocation = event.target.closest('[data-select-sector]');
  if (selectedLocation) {
    const sectorId = selectedLocation.dataset.selectSector;
    $('#equipment-sector').value = sectorId;
    expandedSectorGroupId = null;
    renderSectorPicker(sectorId);
    $('#sector-picker-options').hidden = true;
    $('#sector-picker-toggle').setAttribute('aria-expanded', 'false');
    return;
  }
  if (event.target.closest('#add-equipment')) {
    openEquipmentDialog();
    return;
  }
  const editButton = event.target.closest('[data-edit-equipment]');
  const equipmentButton = event.target.closest('[data-delete-equipment]');
  const sectorButton = event.target.closest('[data-delete-sector]');
  const openSectorButton = event.target.closest('[data-open-sector]');
  if (editButton) {
    if ($('#sector-detail-dialog').open) {
      isEditingFromSector = true;
      $('#sector-detail-dialog').close();
    }
    openEquipmentDialog(editButton.dataset.editEquipment);
  }
  if (equipmentButton) askDelete('equipment', equipmentButton.dataset.deleteEquipment);
  if (sectorButton) askDelete('sector', sectorButton.dataset.deleteSector);
  if (openSectorButton) showSectorDetails(openSectorButton.dataset.openSector);
  const addLocationButton = event.target.closest('[data-add-location]');
  if (addLocationButton) openSectorDialog(addLocationButton.dataset.addLocation);
});

$('#equipment-type-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const type = new FormData(event.currentTarget).get('type').trim();
  const existing = data.equipmentTypes.find((item) => item.toLocaleLowerCase('pt-BR') === type.toLocaleLowerCase('pt-BR'));
  if (existing) {
    renderSelects();
    $('#equipment-type').value = existing;
    $('#equipment-type-dialog').close();
    showToast('Esse tipo já está cadastrado.');
    return;
  }
  data.equipmentTypes.push(type);
  saveData();
  renderSelects();
  $('#equipment-type').value = type;
  $('#equipment-type-dialog').close();
  showToast('Novo tipo cadastrado.');
});

$('#sector-detail-dialog').addEventListener('close', () => {
  if (isEditingFromSector) {
    isEditingFromSector = false;
    return;
  }
  openSectorId = null;
});

$('#confirm-dialog').addEventListener('close', () => {
  if ($('#confirm-dialog').returnValue !== 'confirm' || !pendingDelete) return;
  if (pendingDelete.type === 'equipment') data.equipment = data.equipment.filter((item) => item.id !== pendingDelete.id);
  else data.sectors = data.sectors.filter((sector) => sector.id !== pendingDelete.id);
  saveData();
  render();
  if (openSectorId && sectorById(openSectorId)) showSectorDetails(openSectorId);
  showToast(pendingDelete.type === 'equipment' ? 'Equipamento removido.' : 'Setor removido.');
  pendingDelete = null;
});

window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
render();
switchView(location.hash.slice(1) || 'inicio');
