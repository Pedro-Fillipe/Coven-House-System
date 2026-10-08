# ♰ Coven House System — Documentação Técnica e de Negócios

> **Visão Geral:** Ecossistema de software desenvolvido para a loja alternativa **Coven House**, abrangendo um sistema interno de Gestão de Estoque e Finanças (ERP/Admin) e preparando as bases para a expansão em um E-Commerce público[cite: 3].

---

## 1. Visão Arquitetural

O projeto é dividido em duas fases estratégicas:

* **Fase 1 — ERP Interno (Gestão & Operação):** Substitui as anotações manuais em caderno por um painel digital centralizado[cite: 3]. Controla cadastro de produtos por variação, precificação detalhada, gestão de despesas, agendamentos e registros de vendas[cite: 3, 4].
* **Fase 2 — E-Commerce Público (Catálogo & Vendas Online):** Loja virtual voltada para os clientes finais realizarem pedidos e envios (Correios/Transportadoras), integrada diretamente ao mesmo banco de dados do ERP.

### Stack Tecnológica
* **Backend:** Node.js + Express
* **Banco de Dados:** SQLite3 (Persistência relacional local e leve)
* **Frontend:** HTML5, CSS3 puro (Variáveis CSS, Flexbox/Grid, Responsividade) e JavaScript (Fetch API)
* **Arquitetura:** RESTful API

---

## 2. Regras de Negócio & Lógica Financeira

### 2.1. Estrutura de Precificação e Margem Real
Cada produto cadastrado contempla o custo real dos insumos e materiais, permitindo o cálculo automático da margem bruta unitária[cite: 4]:

$$\text{Lucro Líquido Unitário} = \text{Preço de Venda} - (\text{Preço de Custo} + \text{Custo de Embalagem})$$
[cite: 4]

* **Preço de Custo:** Matéria-prima, confecção ou valor de aquisição do item[cite: 4].
* **Custo de Embalagem:** Caixas, sacolas, cartões e materiais de proteção usados por unidade[cite: 4].
* **Preço de Venda:** Valor final cobrado do cliente[cite: 4].

### 2.2. Gestão de Grade e Estoque
* Produtos possuem variações associadas (por **Tamanho** ex.: P, M, G, GG e por **Cor**)[cite: 3].
* O controle de quantidade em estoque é feito rigorosamente por **variação de item**, impedindo a venda de itens fora de estoque[cite: 3].

### 2.3. Lógica de Frete e Despesas
O sistema suporta três modalidades no momento da venda:
1. **Envio Incluído:** O cliente paga o valor do frete junto ao pedido. O valor compõe o total da venda, porém gera automaticamente um registro no módulo de **Gastos** (categoria *Envio*) para contabilizar a despesa correspondente com a transportadora.
2. **Envio Separado:** O frete é pago diretamente pelo cliente ou cobrado por fora. Não entra no faturamento bruto da loja.
3. **Sem Envio / Retirada:** Venda realizada no local ou encomenda com retirada agendada.

### 2.4. Indicadores Globais do Dashboard
O painel exibe em tempo real[cite: 3]:
* **Total em Vendas:** Receita bruta das vendas efetuadas[cite: 3].
* **Total em Gastos:** Soma de todas as despesas e saídas registradas[cite: 3].
* **Lucro Líquido Real:** $\text{Lucro} = \text{Total Vendas} - \text{Total Gastos}$[cite: 3].
* **Total do Estoque:** Soma do volume de itens disponíveis em todas as variações[cite: 3].

---

## 3. Modelagem de Banco de Dados (SQLite3)

### Tabela `produtos`
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Identificador único do produto |
| `nome` | TEXT NOT NULL | Nome comercial do produto |
| `preco_custo` | REAL NOT NULL | Custo de matéria-prima/aquisição[cite: 4] |
| `custo_embalagem` | REAL NOT NULL | Custo de insumos de embalagem[cite: 4] |
| `preco_venda` | REAL NOT NULL | Valor de venda final[cite: 4] |
| `lucro_liquido` | REAL NOT NULL | Margem de lucro unitária calculada[cite: 4] |

### Tabela `variacoes`
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Identificador único da variação |
| `produto_id` | INTEGER NOT NULL | FK para a tabela `produtos` |
| `tamanho` | TEXT | Tamanho do item (ex.: P, M, G, Único)[cite: 3] |
| `cor` | TEXT | Cor do item (ex.: Preto, Vinho)[cite: 3] |
| `quantidade_estoque` | INTEGER NOT NULL | Quantidade disponível em estoque[cite: 3] |

### Tabela `vendas`
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Identificador da venda |
| `produto_id` | INTEGER NOT NULL | FK para o produto vendido |
| `variacao_