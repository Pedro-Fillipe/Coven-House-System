require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, run, get, all, withTransaction } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function calcularLucroLiquido(precoVenda, precoCusto, custoEmbalagem) {
  const venda = Number(precoVenda) || 0;
  const custo = Number(precoCusto) || 0;
  const embalagem = Number(custoEmbalagem) || 0;
  return Number((venda - (custo + embalagem)).toFixed(2));
}

function hojeISO() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

app.get('/api/produtos', asyncHandler(async (_req, res) => {
  const produtos = await all('SELECT * FROM produtos ORDER BY nome COLLATE NOCASE');
  const variacoes = await all('SELECT * FROM variacoes ORDER BY tamanho, cor');
  const grouped = produtos.map((produto) => ({
    ...produto,
    variacoes: variacoes.filter((item) => item.produto_id === produto.id)
  }));
  res.json(grouped);
}));

app.get('/api/produtos/:id', asyncHandler(async (req, res) => {
  const produto = await get('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  const variacoes = await all('SELECT * FROM variacoes WHERE produto_id = ?', [produto.id]);
  res.json({ ...produto, variacoes });
}));

app.post('/api/produtos', asyncHandler(async (req, res) => {
  const { nome, preco_custo, custo_embalagem, preco_venda } = req.body;
  if (!nome || preco_custo == null || custo_embalagem == null || preco_venda == null) {
    return res.status(400).json({ error: 'Nome e preços são obrigatórios.' });
  }
  const lucro_liquido = calcularLucroLiquido(preco_venda, preco_custo, custo_embalagem);
  const result = await run(
    `INSERT INTO produtos (nome, preco_custo, custo_embalagem, preco_venda, lucro_liquido)
     VALUES (?, ?, ?, ?, ?)`,
    [nome.trim(), Number(preco_custo), Number(custo_embalagem), Number(preco_venda), lucro_liquido]
  );
  const produto = await get('SELECT * FROM produtos WHERE id = ?', [result.id]);
  res.status(201).json({ ...produto, variacoes: [] });
}));

app.put('/api/produtos/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Produto não encontrado.' });
  const { nome, preco_custo, custo_embalagem, preco_venda } = req.body;
  const lucro_liquido = calcularLucroLiquido(preco_venda, preco_custo, custo_embalagem);
  await run(
    `UPDATE produtos
     SET nome = ?, preco_custo = ?, custo_embalagem = ?, preco_venda = ?, lucro_liquido = ?
     WHERE id = ?`,
    [
      (nome || existente.nome).trim(),
      Number(preco_custo ?? existente.preco_custo),
      Number(custo_embalagem ?? existente.custo_embalagem),
      Number(preco_venda ?? existente.preco_venda),
      lucro_liquido,
      req.params.id
    ]
  );
  const produto = await get('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  const variacoes = await all('SELECT * FROM variacoes WHERE produto_id = ?', [produto.id]);
  res.json({ ...produto, variacoes });
}));

app.delete('/api/produtos/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Produto não encontrado.' });
  const venda = await get('SELECT id FROM vendas WHERE produto_id = ? LIMIT 1', [req.params.id]);
  if (venda) {
    return res.status(409).json({
      error: 'Não é possível excluir um produto com vendas registradas.'
    });
  }
  await run('DELETE FROM produtos WHERE id = ?', [req.params.id]);
  res.status(204).send();
}));

app.get('/api/variacoes', asyncHandler(async (req, res) => {
  const { produto_id } = req.query;
  const rows = produto_id
    ? await all('SELECT * FROM variacoes WHERE produto_id = ? ORDER BY tamanho, cor', [produto_id])
    : await all('SELECT * FROM variacoes ORDER BY produto_id, tamanho, cor');
  res.json(rows);
}));

app.post('/api/variacoes', asyncHandler(async (req, res) => {
  const { produto_id, tamanho, cor, quantidade_estoque } = req.body;
  if (!produto_id || quantidade_estoque == null) {
    return res.status(400).json({ error: 'produto_id e quantidade_estoque são obrigatórios.' });
  }
  const produto = await get('SELECT id FROM produtos WHERE id = ?', [produto_id]);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
  const result = await run(
    `INSERT INTO variacoes (produto_id, tamanho, cor, quantidade_estoque)
     VALUES (?, ?, ?, ?)`,
    [produto_id, tamanho || 'Único', cor || 'Padrão', Number(quantidade_estoque)]
  );
  const variacao = await get('SELECT * FROM variacoes WHERE id = ?', [result.id]);
  res.status(201).json(variacao);
}));

app.put('/api/variacoes/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM variacoes WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Variação não encontrada.' });
  const { tamanho, cor, quantidade_estoque } = req.body;
  await run(
    `UPDATE variacoes SET tamanho = ?, cor = ?, quantidade_estoque = ? WHERE id = ?`,
    [
      tamanho ?? existente.tamanho,
      cor ?? existente.cor,
      Number(quantidade_estoque ?? existente.quantidade_estoque),
      req.params.id
    ]
  );
  const variacao = await get('SELECT * FROM variacoes WHERE id = ?', [req.params.id]);
  res.json(variacao);
}));

app.delete('/api/variacoes/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM variacoes WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Variação não encontrada.' });
  const venda = await get('SELECT id FROM vendas WHERE variacao_id = ? LIMIT 1', [req.params.id]);
  if (venda) {
    return res.status(409).json({
      error: 'Não é possível excluir uma variação com vendas registradas.'
    });
  }
  await run('DELETE FROM variacoes WHERE id = ?', [req.params.id]);
  res.status(204).send();
}));

app.get('/api/vendas', asyncHandler(async (_req, res) => {
  const vendas = await all(`
    SELECT
      v.*,
      p.nome AS produto_nome,
      p.preco_venda,
      vr.tamanho,
      vr.cor
    FROM vendas v
    JOIN produtos p ON p.id = v.produto_id
    JOIN variacoes vr ON vr.id = v.variacao_id
    ORDER BY v.data DESC, v.id DESC
  `);
  res.json(vendas);
}));

app.post('/api/vendas', asyncHandler(async (req, res) => {
  const { produto_id, variacao_id, cliente, quantidade, tipo_frete, valor_frete, data } = req.body;
  const tiposValidos = ['incluido', 'separado', 'retirada'];
  if (!produto_id || !variacao_id || !quantidade || !tipo_frete) {
    return res.status(400).json({ error: 'Produto, variação, quantidade e tipo de frete são obrigatórios.' });
  }
  if (!tiposValidos.includes(tipo_frete)) {
    return res.status(400).json({ error: 'Tipo de frete inválido.' });
  }

  const venda = await withTransaction(async () => {
    const produto = await get('SELECT * FROM produtos WHERE id = ?', [produto_id]);
    if (!produto) {
      const error = new Error('Produto não encontrado.');
      error.status = 404;
      throw error;
    }
    const variacao = await get('SELECT * FROM variacoes WHERE id = ? AND produto_id = ?', [
      variacao_id,
      produto_id
    ]);
    if (!variacao) {
      const error = new Error('Variação não encontrada para este produto.');
      error.status = 404;
      throw error;
    }
    const qtd = Number(quantidade);
    if (qtd <= 0) {
      const error = new Error('Quantidade deve ser maior que zero.');
      error.status = 400;
      throw error;
    }
    if (variacao.quantidade_estoque < qtd) {
      const error = new Error('Estoque insuficiente para esta variação.');
      error.status = 409;
      throw error;
    }

    const frete = Number(valor_frete) || 0;
    const subtotal = produto.preco_venda * qtd;
    const total = tipo_frete === 'incluido' ? Number((subtotal + frete).toFixed(2)) : Number(subtotal.toFixed(2));
    const dataVenda = data || hojeISO();

    const result = await run(
      `INSERT INTO vendas (produto_id, variacao_id, cliente, quantidade, tipo_frete, valor_frete, total, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [produto_id, variacao_id, (cliente || '').trim(), qtd, tipo_frete, frete, total, dataVenda]
    );

    await run(
      'UPDATE variacoes SET quantidade_estoque = quantidade_estoque - ? WHERE id = ?',
      [qtd, variacao_id]
    );

    if (tipo_frete === 'incluido' && frete > 0) {
      await run(
        `INSERT INTO gastos (descricao, categoria, valor, data)
         VALUES (?, ?, ?, ?)`,
        [`Frete venda #${result.id} — ${produto.nome}`, 'Envio', frete, dataVenda]
      );
    }

    return get(
      `SELECT
         v.*,
         p.nome AS produto_nome,
         p.preco_venda,
         vr.tamanho,
         vr.cor
       FROM vendas v
       JOIN produtos p ON p.id = v.produto_id
       JOIN variacoes vr ON vr.id = v.variacao_id
       WHERE v.id = ?`,
      [result.id]
    );
  });

  res.status(201).json(venda);
}));

app.put('/api/vendas/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM vendas WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Venda não encontrada.' });
  const { cliente, data } = req.body;
  await run('UPDATE vendas SET cliente = ?, data = ? WHERE id = ?', [
    cliente != null ? cliente.trim() : existente.cliente,
    data || existente.data,
    req.params.id
  ]);
  const venda = await get(
    `SELECT
       v.*,
       p.nome AS produto_nome,
       p.preco_venda,
       vr.tamanho,
       vr.cor
     FROM vendas v
     JOIN produtos p ON p.id = v.produto_id
     JOIN variacoes vr ON vr.id = v.variacao_id
     WHERE v.id = ?`,
    [req.params.id]
  );
  res.json(venda);
}));

app.delete('/api/vendas/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM vendas WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Venda não encontrada.' });

  await withTransaction(async () => {
    await run(
      'UPDATE variacoes SET quantidade_estoque = quantidade_estoque + ? WHERE id = ?',
      [existente.quantidade, existente.variacao_id]
    );
    await run(
      `DELETE FROM gastos
       WHERE categoria = 'Envio' AND descricao LIKE ?`,
      [`Frete venda #${existente.id}%`]
    );
    await run('DELETE FROM vendas WHERE id = ?', [existente.id]);
  });

  res.status(204).send();
}));

app.get('/api/gastos', asyncHandler(async (_req, res) => {
  const gastos = await all('SELECT * FROM gastos ORDER BY data DESC, id DESC');
  res.json(gastos);
}));

app.post('/api/gastos', asyncHandler(async (req, res) => {
  const { descricao, categoria, valor, data } = req.body;
  if (!descricao || !categoria || valor == null) {
    return res.status(400).json({ error: 'Descrição, categoria e valor são obrigatórios.' });
  }
  const result = await run(
    `INSERT INTO gastos (descricao, categoria, valor, data) VALUES (?, ?, ?, ?)`,
    [descricao.trim(), categoria.trim(), Number(valor), data || hojeISO()]
  );
  const gasto = await get('SELECT * FROM gastos WHERE id = ?', [result.id]);
  res.status(201).json(gasto);
}));

app.put('/api/gastos/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM gastos WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Gasto não encontrado.' });
  const { descricao, categoria, valor, data } = req.body;
  await run(
    `UPDATE gastos SET descricao = ?, categoria = ?, valor = ?, data = ? WHERE id = ?`,
    [
      descricao != null ? descricao.trim() : existente.descricao,
      categoria != null ? categoria.trim() : existente.categoria,
      Number(valor ?? existente.valor),
      data || existente.data,
      req.params.id
    ]
  );
  const gasto = await get('SELECT * FROM gastos WHERE id = ?', [req.params.id]);
  res.json(gasto);
}));

app.delete('/api/gastos/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM gastos WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Gasto não encontrado.' });
  await run('DELETE FROM gastos WHERE id = ?', [req.params.id]);
  res.status(204).send();
}));

app.get('/api/agenda', asyncHandler(async (_req, res) => {
  const agenda = await all('SELECT * FROM agenda ORDER BY data ASC, hora ASC');
  res.json(agenda);
}));

app.post('/api/agenda', asyncHandler(async (req, res) => {
  const { cliente, tipo, data, hora, status } = req.body;
  if (!cliente || !tipo || !data || !hora) {
    return res.status(400).json({ error: 'Cliente, tipo, data e hora são obrigatórios.' });
  }
  const result = await run(
    `INSERT INTO agenda (cliente, tipo, data, hora, status) VALUES (?, ?, ?, ?, ?)`,
    [cliente.trim(), tipo.trim(), data, hora, status || 'Pendente']
  );
  const item = await get('SELECT * FROM agenda WHERE id = ?', [result.id]);
  res.status(201).json(item);
}));

app.put('/api/agenda/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM agenda WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  const { cliente, tipo, data, hora, status } = req.body;
  await run(
    `UPDATE agenda SET cliente = ?, tipo = ?, data = ?, hora = ?, status = ? WHERE id = ?`,
    [
      cliente != null ? cliente.trim() : existente.cliente,
      tipo != null ? tipo.trim() : existente.tipo,
      data || existente.data,
      hora || existente.hora,
      status || existente.status,
      req.params.id
    ]
  );
  const item = await get('SELECT * FROM agenda WHERE id = ?', [req.params.id]);
  res.json(item);
}));

app.delete('/api/agenda/:id', asyncHandler(async (req, res) => {
  const existente = await get('SELECT * FROM agenda WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  await run('DELETE FROM agenda WHERE id = ?', [req.params.id]);
  res.status(204).send();
}));

app.get('/api/dashboard', asyncHandler(async (_req, res) => {
  const vendas = await get('SELECT COALESCE(SUM(total), 0) AS total FROM vendas');
  const gastos = await get('SELECT COALESCE(SUM(valor), 0) AS total FROM gastos');
  const estoque = await get('SELECT COALESCE(SUM(quantidade_estoque), 0) AS total FROM variacoes');
  const totalVendas = Number(vendas.total) || 0;
  const totalGastos = Number(gastos.total) || 0;
  res.json({
    total_vendas: Number(totalVendas.toFixed(2)),
    total_gastos: Number(totalGastos.toFixed(2)),
    lucro_liquido_real: Number((totalVendas - totalGastos).toFixed(2)),
    total_estoque: Number(estoque.total) || 0
  });
}));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Erro interno do servidor.' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Coven House System em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar o banco de dados:', error);
    process.exit(1);
  });
