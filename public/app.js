const API = '/api';
const state = {
  produtos: [],
  vendas: [],
  gastos: [],
  agenda: [],
  dashboard: null
};

const toastEl = document.getElementById('toast');
const formVenda = document.getElementById('form-venda');
const formProduto = document.getElementById('form-produto');
const formVariacao = document.getElementById('form-variacao');
const formGasto = document.getElementById('form-gasto');
const formAgenda = document.getElementById('form-agenda');
const modalProduto = document.getElementById('modal-produto');
const modalVariacao = document.getElementById('modal-variacao');

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toast(message, isError = false) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  toastEl.style.background = isError ? '#4d0b1a' : '#6f1026';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Falha na requisição.');
  }
  return data;
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  document.getElementById(`view-${name}`).classList.add('active');
}

function lucroUnitario(custo, embalagem, venda) {
  return Number((Number(venda || 0) - (Number(custo || 0) + Number(embalagem || 0))).toFixed(2));
}

function updateLucroPreview() {
  const data = new FormData(formProduto);
  const lucro = lucroUnitario(
    data.get('preco_custo'),
    data.get('custo_embalagem'),
    data.get('preco_venda')
  );
  document.getElementById('lucro-preview').textContent = money(lucro);
}

function fillProductSelects() {
  const produtoSelect = formVenda.produto_id;
  const current = produtoSelect.value;
  produtoSelect.innerHTML = '<option value="">Selecione</option>' + state.produtos
    .map((p) => `<option value="${p.id}">${p.nome}</option>`)
    .join('');
  if (current) produtoSelect.value = current;
  fillVariationSelect();
}

function fillVariationSelect() {
  const produtoId = Number(formVenda.produto_id.value);
  const produto = state.produtos.find((p) => p.id === produtoId);
  const select = formVenda.variacao_id;
  const variations = produto?.variacoes || [];
  select.innerHTML = variations.length
    ? variations.map((v) => `
        <option value="${v.id}" ${v.quantidade_estoque <= 0 ? 'disabled' : ''}>
          ${v.tamanho} / ${v.cor} (${v.quantidade_estoque} un.)
        </option>
      `).join('')
    : '<option value="">Sem variações</option>';
  updateSaleTotal();
}

function freightLabel(type) {
  return {
    incluido: 'Incluído',
    separado: 'Separado',
    retirada: 'Retirada'
  }[type] || type;
}

function updateSaleTotal() {
  const produto = state.produtos.find((p) => p.id === Number(formVenda.produto_id.value));
  const qty = Number(formVenda.quantidade.value) || 0;
  const tipo = formVenda.tipo_frete.value;
  const frete = Number(formVenda.valor_frete.value) || 0;
  const subtotal = produto ? produto.preco_venda * qty : 0;
  const total = tipo === 'incluido' ? subtotal + frete : subtotal;
  document.getElementById('venda-total').textContent = money(total);
  const hint = document.getElementById('venda-hint');
  if (tipo === 'incluido') {
    hint.textContent = 'O frete entra no total da venda e gera um gasto automático na categoria Envio.';
  } else if (tipo === 'separado') {
    hint.textContent = 'O frete é cobrado à parte e não entra no faturamento da loja.';
  } else {
    hint.textContent = 'Venda local ou retirada agendada — sem frete no faturamento.';
  }
}

function renderDashboard() {
  const dash = state.dashboard || {};
  document.getElementById('kpi-vendas').textContent = money(dash.total_vendas);
  document.getElementById('kpi-gastos').textContent = money(dash.total_gastos);
  document.getElementById('kpi-lucro').textContent = money(dash.lucro_liquido_real);
  document.getElementById('kpi-estoque').textContent = dash.total_estoque ?? 0;
  const recent = state.vendas.slice(0, 6);
  document.getElementById('dash-vendas').innerHTML = recent.length
    ? recent.map((v) => `
        <tr>
          <td>${formatDate(v.data)}</td>
          <td>${v.cliente || '—'}</td>
          <td>${v.produto_nome}</td>
          <td>${v.tamanho} / ${v.cor}</td>
          <td>${v.quantidade}</td>
          <td>${money(v.total)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" class="empty">Nenhuma venda registrada.</td></tr>';
}

function renderSales() {
  document.getElementById('lista-vendas').innerHTML = state.vendas.length
    ? state.vendas.map((v) => `
        <tr>
          <td>${formatDate(v.data)}</td>
          <td>${v.cliente || '—'}</td>
          <td>${v.produto_nome}</td>
          <td>${v.tamanho} / ${v.cor}</td>
          <td>${v.quantidade}</td>
          <td>${freightLabel(v.tipo_frete)}${v.valor_frete ? ` · ${money(v.valor_frete)}` : ''}</td>
          <td>${money(v.total)}</td>
          <td><button class="btn small ghost" data-del-venda="${v.id}">Excluir</button></td>
        </tr>
      `).join('')
    : '<tr><td colspan="8" class="empty">Nenhuma venda registrada.</td></tr>';
}

function renderProducts() {
  const root = document.getElementById('lista-produtos');
  if (!state.produtos.length) {
    root.innerHTML = '<p class="empty">Nenhum produto cadastrado. Inicie o grimório do estoque.</p>';
    return;
  }
  root.innerHTML = state.produtos.map((p) => `
    <article class="product-card">
      <header>
        <div>
          <h3>${p.nome}</h3>
          <p class="hint" style="margin:0.3rem 0 0">Margem unitária ${money(p.lucro_liquido)}</p>
        </div>
        <div class="actions">
          <button class="btn small ghost" data-edit-produto="${p.id}">Editar</button>
          <button class="btn small ghost" data-del-produto="${p.id}">Excluir</button>
        </div>
      </header>
      <div class="price-grid">
        <div>Custo<br><strong>${money(p.preco_custo)}</strong></div>
        <div>Embalagem<br><strong>${money(p.custo_embalagem)}</strong></div>
        <div>Venda<br><strong>${money(p.preco_venda)}</strong></div>
        <div>Lucro<br><strong>${money(p.lucro_liquido)}</strong></div>
      </div>
      <div class="actions">
        <button class="btn small" data-add-variacao="${p.id}">+ Variação</button>
      </div>
      <div class="variation-grid">
        ${(p.variacoes || []).length
          ? p.variacoes.map((v) => `
              <div class="variation ${v.quantidade_estoque <= 2 ? 'low' : ''}">
                <span>${v.tamanho}</span>
                <span>${v.cor}</span>
                <span>${v.quantidade_estoque} un.</span>
                <span class="actions">
                  <button class="btn small ghost" data-edit-variacao="${v.id}">Editar</button>
                  <button class="btn small ghost" data-del-variacao="${v.id}">X</button>
                </span>
              </div>
            `).join('')
          : '<p class="empty">Sem grade de variações.</p>'}
      </div>
    </article>
  `).join('');
}

function renderExpenses() {
  document.getElementById('lista-gastos').innerHTML = state.gastos.length
    ? state.gastos.map((g) => `
        <tr>
          <td>${formatDate(g.data)}</td>
          <td>${g.descricao}</td>
          <td><span class="badge">${g.categoria}</span></td>
          <td>${money(g.valor)}</td>
          <td><button class="btn small ghost" data-del-gasto="${g.id}">Excluir</button></td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="empty">Nenhum gasto lançado.</td></tr>';
}

function renderAgenda() {
  document.getElementById('lista-agenda').innerHTML = state.agenda.length
    ? state.agenda.map((a) => `
        <tr>
          <td>${formatDate(a.data)}</td>
          <td>${a.hora}</td>
          <td>${a.cliente}</td>
          <td>${a.tipo}</td>
          <td class="status-${a.status}">${a.status}</td>
          <td class="actions">
            <button class="btn small ghost" data-edit-agenda="${a.id}">Editar</button>
            <button class="btn small ghost" data-del-agenda="${a.id}">Excluir</button>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" class="empty">Nenhum agendamento.</td></tr>';
}

async function refresh() {
  const [produtos, vendas, gastos, agenda, dashboard] = await Promise.all([
    request('/produtos'),
    request('/vendas'),
    request('/gastos'),
    request('/agenda'),
    request('/dashboard')
  ]);
  state.produtos = produtos;
  state.vendas = vendas;
  state.gastos = gastos;
  state.agenda = agenda;
  state.dashboard = dashboard;
  fillProductSelects();
  renderDashboard();
  renderSales();
  renderProducts();
  renderExpenses();
  renderAgenda();
}

function openProductModal(produto) {
  formProduto.reset();
  document.getElementById('modal-produto-titulo').textContent = produto ? 'Editar produto' : 'Novo produto';
  formProduto.id.value = produto?.id || '';
  formProduto.nome.value = produto?.nome || '';
  formProduto.preco_custo.value = produto?.preco_custo ?? '';
  formProduto.custo_embalagem.value = produto?.custo_embalagem ?? '';
  formProduto.preco_venda.value = produto?.preco_venda ?? '';
  updateLucroPreview();
  modalProduto.showModal();
}

function openVariationModal(produtoId, variacao) {
  formVariacao.reset();
  formVariacao.produto_id.value = produtoId;
  formVariacao.id.value = variacao?.id || '';
  formVariacao.tamanho.value = variacao?.tamanho || '';
  formVariacao.cor.value = variacao?.cor || '';
  formVariacao.quantidade_estoque.value = variacao?.quantidade_estoque ?? 0;
  modalVariacao.querySelector('h3').textContent = variacao ? 'Editar variação' : 'Nova variação';
  modalVariacao.showModal();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

document.getElementById('btn-novo-produto').addEventListener('click', () => openProductModal());
document.getElementById('fechar-produto').addEventListener('click', () => modalProduto.close());
document.getElementById('cancelar-produto').addEventListener('click', () => modalProduto.close());
document.getElementById('fechar-variacao').addEventListener('click', () => modalVariacao.close());
document.getElementById('cancelar-variacao').addEventListener('click', () => modalVariacao.close());

['preco_custo', 'custo_embalagem', 'preco_venda'].forEach((name) => {
  formProduto[name].addEventListener('input', updateLucroPreview);
});

formVenda.produto_id.addEventListener('change', fillVariationSelect);
formVenda.quantidade.addEventListener('input', updateSaleTotal);
formVenda.valor_frete.addEventListener('input', updateSaleTotal);
formVenda.tipo_frete.addEventListener('change', () => {
  const included = formVenda.tipo_frete.value === 'incluido';
  document.getElementById('frete-field').hidden = !included;
  if (!included) formVenda.valor_frete.value = 0;
  updateSaleTotal();
});

formProduto.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    nome: formProduto.nome.value,
    preco_custo: Number(formProduto.preco_custo.value),
    custo_embalagem: Number(formProduto.custo_embalagem.value),
    preco_venda: Number(formProduto.preco_venda.value)
  };
  try {
    if (formProduto.id.value) {
      await request(`/produtos/${formProduto.id.value}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Produto atualizado.');
    } else {
      await request('/produtos', { method: 'POST', body: JSON.stringify(payload) });
      toast('Produto cadastrado.');
    }
    modalProduto.close();
    await refresh();
  } catch (error) {
    toast(error.message, true);
  }
});

formVariacao.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    produto_id: Number(formVariacao.produto_id.value),
    tamanho: formVariacao.tamanho.value,
    cor: formVariacao.cor.value,
    quantidade_estoque: Number(formVariacao.quantidade_estoque.value)
  };
  try {
    if (formVariacao.id.value) {
      await request(`/variacoes/${formVariacao.id.value}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Variação atualizada.');
    } else {
      await request('/variacoes', { method: 'POST', body: JSON.stringify(payload) });
      toast('Variação adicionada.');
    }
    modalVariacao.close();
    await refresh();
  } catch (error) {
    toast(error.message, true);
  }
});

formVenda.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    cliente: formVenda.cliente.value,
    produto_id: Number(formVenda.produto_id.value),
    variacao_id: Number(formVenda.variacao_id.value),
    quantidade: Number(formVenda.quantidade.value),
    tipo_frete: formVenda.tipo_frete.value,
    valor_frete: Number(formVenda.valor_frete.value) || 0,
    data: formVenda.data.value
  };
  try {
    await request('/vendas', { method: 'POST', body: JSON.stringify(payload) });
    toast('Venda registrada.');
    formVenda.reset();
    formVenda.data.value = today();
    document.getElementById('frete-field').hidden = true;
    await refresh();
  } catch (error) {
    toast(error.message, true);
  }
});

formGasto.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    descricao: formGasto.descricao.value,
    categoria: formGasto.categoria.value,
    valor: Number(formGasto.valor.value),
    data: formGasto.data.value
  };
  try {
    await request('/gastos', { method: 'POST', body: JSON.stringify(payload) });
    toast('Gasto lançado.');
    formGasto.reset();
    formGasto.data.value = today();
    await refresh();
  } catch (error) {
    toast(error.message, true);
  }
});

formAgenda.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    cliente: formAgenda.cliente.value,
    tipo: formAgenda.tipo.value,
    data: formAgenda.data.value,
    hora: formAgenda.hora.value,
    status: formAgenda.status.value
  };
  try {
    if (formAgenda.id.value) {
      await request(`/agenda/${formAgenda.id.value}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Agendamento atualizado.');
    } else {
      await request('/agenda', { method: 'POST', body: JSON.stringify(payload) });
      toast('Agendamento criado.');
    }
    formAgenda.reset();
    await refresh();
  } catch (error) {
    toast(error.message, true);
  }
});

document.body.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;

  const deletions = [
    ['delVenda', (id) => request(`/vendas/${id}`, { method: 'DELETE' }), 'Venda removida e estoque restaurado.'],
    ['delProduto', (id) => request(`/produtos/${id}`, { method: 'DELETE' }), 'Produto excluído.'],
    ['delVariacao', (id) => request(`/variacoes/${id}`, { method: 'DELETE' }), 'Variação excluída.'],
    ['delGasto', (id) => request(`/gastos/${id}`, { method: 'DELETE' }), 'Gasto excluído.'],
    ['delAgenda', (id) => request(`/agenda/${id}`, { method: 'DELETE' }), 'Agendamento excluído.']
  ];

  for (const [key, action, message] of deletions) {
    const id = target.dataset[key];
    if (!id) continue;
    if (!confirm('Confirmar exclusão?')) return;
    try {
      await action(id);
      toast(message);
      await refresh();
    } catch (error) {
      toast(error.message, true);
    }
    return;
  }

  if (target.dataset.editProduto) {
    const produto = state.produtos.find((p) => p.id === Number(target.dataset.editProduto));
    openProductModal(produto);
  }
  if (target.dataset.addVariacao) {
    openVariationModal(Number(target.dataset.addVariacao));
  }
  if (target.dataset.editVariacao) {
    const id = Number(target.dataset.editVariacao);
    const produto = state.produtos.find((p) => (p.variacoes || []).some((v) => v.id === id));
    const variacao = produto?.variacoes.find((v) => v.id === id);
    openVariationModal(produto.id, variacao);
  }
  if (target.dataset.editAgenda) {
    const item = state.agenda.find((a) => a.id === Number(target.dataset.editAgenda));
    if (!item) return;
    formAgenda.id.value = item.id;
    formAgenda.cliente.value = item.cliente;
    formAgenda.tipo.value = item.tipo;
    formAgenda.data.value = item.data;
    formAgenda.hora.value = item.hora;
    formAgenda.status.value = item.status;
    showView('agenda');
  }
});

formVenda.data.value = today();
formGasto.data.value = today();

refresh().catch((error) => toast(error.message, true));
