import { goToScreen } from '../utils/navigation.js';
import { formatarQuantidade } from '../utils/formatters.js';
import { montarResumoPedido } from '../utils/resumoPedido.js';
import { itensCaixaReserva, itensUtensiliosBartender } from '../data/itensFixosPedido.js';
import { pedirConfirmacao } from '../components/confirmacao.js';
import { pedirValorNumerico } from '../components/edicaoValor.js';
import { criarRepositorioPorEvento } from '../utils/repositorioPorEvento.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { isAdmin, getUsuarioAtual } from '../utils/auth.js';
import { supabase } from '../utils/supabaseClient.js';
import { Drinks } from './drinks.js';
import { $ } from '../utils/dom.js';

const TABELA_SEPARADOS = 'itens_separados';
const TABELA_EXTRAS = 'itens_extras_lista_compras';
const TABELA_AJUSTES = 'ajustes_quantidade_lista_compras';
const CONVIDADOS_BASE = 50; // insumos de cada drink são cadastrados "a cada 50 convidados"

const state = {
  textoAtual: '',
  eventoAtual: null,
  separados: new Set(),
  ajustes: new Map(),
  extras: []
};
let canalRealtime = null;

// ---------- Repositório de itens já separados (persistido por evento no Supabase) ----------
const ItensSeparadosRepository = {
  async getChaves(eventoId) {
    const { data, error } = await supabase
      .from(TABELA_SEPARADOS)
      .select('chave')
      .eq('evento_id', eventoId);

    if (error) {
      console.error('Erro ao carregar itens separados:', error.message);
      return new Set();
    }
    return new Set(data.map(linha => linha.chave));
  },

  async toggle(eventoId, chave, estaSeparadoAgora) {
    const { error } = estaSeparadoAgora
      ? await supabase.from(TABELA_SEPARADOS).delete().eq('evento_id', eventoId).eq('chave', chave)
      : await supabase.from(TABELA_SEPARADOS).insert({ evento_id: eventoId, chave });

    if (error) console.error('Erro ao atualizar item separado:', error.message);
    return !error;
  },

  // Um canal por evento (o filtro evita ficar recebendo mudanças de outros
  // pedidos). Reabrir a lista de compras troca o canal pro evento novo.
  assinar(eventoId, callback) {
    if (canalRealtime) supabase.removeChannel(canalRealtime);

    canalRealtime = supabase
      .channel(`realtime:${TABELA_SEPARADOS}:${eventoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABELA_SEPARADOS, filter: `evento_id=eq.${eventoId}` },
        callback
      )
      .subscribe();
  }
};

// ---------- Repositório de itens extras (materiais que o admin adiciona à mão,
// além do que foi gerado automaticamente) ----------
// A política de RLS da tabela só deixa admins inserirem/editarem/excluírem —
// o data-admin-only nos botões é só a camada visual, mesmo padrão usado em
// drinks.js e eventos.js para exclusão.
const ItensExtrasRepositorioBase = criarRepositorioPorEvento(TABELA_EXTRAS);

const ItensExtrasRepository = {
  getAll: ItensExtrasRepositorioBase.getAll,

  add(eventoId, { nome, quantidade, unidade }) {
    return ItensExtrasRepositorioBase.add({
      evento_id: eventoId,
      nome,
      quantidade,
      unidade,
      criado_por: getUsuarioAtual()?.id
    });
  },

  atualizarQuantidade(id, quantidade) {
    return ItensExtrasRepositorioBase.update(id, { quantidade });
  },

  remove: ItensExtrasRepositorioBase.remove,
  assinar: ItensExtrasRepositorioBase.assinar
};

// ---------- Repositório de ajustes de quantidade (sobrescreve, por evento, o
// valor calculado automaticamente para um item de "Insumos dos Drinks",
// "Caixa Reserva" ou "Utensílios Bartender" — sem alterar o cálculo em si) ----------
const AjustesRepositorioBase = criarRepositorioPorEvento(TABELA_AJUSTES);

const AjustesRepository = {
  async getMapa(eventoId) {
    const linhas = await AjustesRepositorioBase.getAll(eventoId);
    return new Map(linhas.map(linha => [linha.chave, Number(linha.quantidade)]));
  },

  salvar(eventoId, chave, quantidade) {
    return AjustesRepositorioBase.upsert(
      { evento_id: eventoId, chave, quantidade, atualizado_por: getUsuarioAtual()?.id },
      'evento_id,chave'
    );
  },

  assinar: AjustesRepositorioBase.assinar
};

// ---------- Cálculo dos insumos dos drinks (regra de 3: quantidade cadastrada está
// para 50, assim como quantidade necessária está para os convidados do pedido) ----------
function calcularInsumosDrinks(evento) {
  const mapa = new Map();

  (evento.drinksSelecionados || []).forEach(drinkId => {
    const drink = Drinks.getAll().find(d => d.id === drinkId);
    (drink?.insumos || []).forEach(insumo => {
      const quantidadeNecessaria = (insumo.quantidade / CONVIDADOS_BASE) * (evento.convidados || 0);
      const chave = `${insumo.nome.toLowerCase()}|${insumo.unidade}`;
      const acumulado = mapa.get(chave) || { nome: insumo.nome, unidade: insumo.unidade, quantidade: 0 };
      acumulado.quantidade += quantidadeNecessaria;
      mapa.set(chave, acumulado);
    });
  });

  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------- Identidade de cada item (usada para separar, ajustar e persistir) ----------
// Itens automáticos usam "título da seção + nome" (o nome não muda entre
// renderizações); itens extras usam o próprio id do registro — mais robusto
// que o nome, já que o admin pode cadastrar dois itens extras com nomes iguais.
const itemChave = (secao, item) => secao.tipo === 'extra' ? `extra-${item.id}` : `${secao.titulo}|${item.nome}`;

// Aplica por cima os ajustes de quantidade já salvos, sem alterar a lógica
// de cálculo em si (SRP: uma função calcula, outra decide se o calculado
// deve ser sobrescrito por um valor definido manualmente pelo admin).
function aplicarAjustes(secao, ajustes) {
  return {
    ...secao,
    itens: secao.itens.map(item => {
      const chave = itemChave(secao, item);
      return ajustes.has(chave) ? { ...item, quantidade: ajustes.get(chave) } : item;
    })
  };
}

// ---------- Seções da lista de compras: cada uma sabe só de onde vêm seus itens ----------
function montarSecoes(evento, ajustes, extras) {
  const secoesAutomaticas = [
    { titulo: 'Insumos dos Drinks', tipo: 'auto', itens: calcularInsumosDrinks(evento) },
    { titulo: 'Caixa Reserva', tipo: 'auto', itens: itensCaixaReserva() },
    { titulo: 'Utensílios Bartender', tipo: 'auto', itens: itensUtensiliosBartender(evento.bartenders) }
  ].map(secao => aplicarAjustes(secao, ajustes));

  const secaoExtras = {
    titulo: 'Itens Adicionados',
    tipo: 'extra',
    itens: extras.map(e => ({ id: e.id, nome: e.nome, quantidade: e.quantidade, unidade: e.unidade }))
  };

  return [...secoesAutomaticas, secaoExtras].filter(secao => secao.itens.length);
}

// ---------- Apresentação (uma única fonte pro texto: usada na tela E na cópia) ----------
const linhaItem = item => `${item.nome}: ${formatarQuantidade(item.quantidade)} ${item.unidade}`;
const linhaResumo = l => `${l.label}: ${l.valor}`;

function montarTexto(evento, resumo, secoes) {
  const cabecalho = `Lista de Compras — ${evento.cliente} (${evento.convidados || 0} convidados)`;
  const blocoResumo = resumo.map(linhaResumo);
  const blocosSecoes = secoes.flatMap(secao => [
    '',
    `${secao.titulo}:`,
    ...secao.itens.map(i => `• ${linhaItem(i)}`)
  ]);
  return [cabecalho, '', ...blocoResumo, ...blocosSecoes].join('\n');
}

function renderResumo(resumo) {
  const container = $('lista-compras-resumo');
  if (!container) return;
  container.innerHTML = resumo.length
    ? resumo.map(l => `
        <div class="resumo-item">
          <span class="resumo-item-label">${l.label}</span>
          <span class="resumo-item-valor">${l.valor}</span>
        </div>`).join('')
    : '';
}

// Botões restritos ao admin: editar quantidade (todo item) e remover
// (só faz sentido para itens extras — os automáticos refletem o pedido).
function botoesAdminHTML(secao, item, chave) {
  const qtdParaEdicao = formatarQuantidade(item.quantidade);

  const botaoEditar = `
    <button type="button" class="compras-item-editar" data-admin-only
      data-chave="${chave}" data-quantidade="${qtdParaEdicao}" data-nome="${item.nome}"
      aria-label="Editar quantidade de ${item.nome}">✎</button>`;

  const botaoRemover = secao.tipo === 'extra'
    ? `<button type="button" class="compras-item-remover" data-admin-only
        data-id="${item.id}" data-nome="${item.nome}"
        aria-label="Remover ${item.nome} da lista">×</button>`
    : '';

  return `<span class="compras-item-acoes">${botaoEditar}${botaoRemover}</span>`;
}

function itemHTML(secao, item, chave, separado) {
  return `
    <div class="compras-item ${separado ? 'separado' : ''}" data-chave="${chave}">
      <span class="compras-item-check" aria-hidden="true"></span>
      <span class="compras-item-nome">${item.nome}</span>
      <span class="compras-item-qtd">${formatarQuantidade(item.quantidade)} ${item.unidade}</span>
      ${botoesAdminHTML(secao, item, chave)}
    </div>`;
}

function secaoHTML(secao) {
  const itens = secao.itens
    .map(item => {
      const chave = itemChave(secao, item);
      return itemHTML(secao, item, chave, state.separados.has(chave));
    })
    .join('');
  return `<div class="eventos-secao-titulo">${secao.titulo}</div>${itens}`;
}

function renderItens(secoes) {
  $('lista-compras-itens').innerHTML = secoes.length
    ? secoes.map(secaoHTML).join('')
    : `<p class="empty-state">Nenhum item cadastrado para este pedido.</p>`;
}

function render(evento, resumo, secoes) {
  $('lista-compras-subtitulo').textContent = `${evento.cliente} · ${evento.convidados || 0} convidados`;
  renderResumo(resumo);
  renderItens(secoes);
}

// Recalcula tudo a partir do estado atual e redesenha — chamada tanto ao
// abrir a lista quanto depois de qualquer mudança local ou vinda do realtime.
function atualizarTela() {
  const evento = state.eventoAtual;
  const secoes = montarSecoes(evento, state.ajustes, state.extras);
  const resumo = montarResumoPedido(evento);

  render(evento, resumo, secoes);
  state.textoAtual = montarTexto(evento, resumo, secoes);
}

// ---------- API pública ----------
async function abrir(evento) {
  state.eventoAtual = evento;
  state.separados = await ItensSeparadosRepository.getChaves(evento.id);
  state.ajustes = await AjustesRepository.getMapa(evento.id);
  state.extras = await ItensExtrasRepository.getAll(evento.id);

  atualizarTela();
  goToScreen('screen-lista-compras');

  // Redesenha os itens sempre que outro usuário conectado marcar/desmarcar,
  // ajustar uma quantidade ou adicionar/remover um item extra neste mesmo
  // pedido — sem precisar recarregar a página.
  ItensSeparadosRepository.assinar(evento.id, async () => {
    state.separados = await ItensSeparadosRepository.getChaves(evento.id);
    atualizarTela();
  });

  AjustesRepository.assinar(evento.id, async () => {
    state.ajustes = await AjustesRepository.getMapa(evento.id);
    atualizarTela();
  });

  ItensExtrasRepository.assinar(evento.id, async () => {
    state.extras = await ItensExtrasRepository.getAll(evento.id);
    atualizarTela();
  });
}

function mensagemConfirmacao(nome, estaSeparado) {
  return estaSeparado
    ? `Desmarcar "${nome}" como separado?`
    : `Marcar "${nome}" como separado?`;
}

async function toggleItemSeparado(elemento) {
  const chave = elemento.dataset.chave;
  const nome = elemento.querySelector('.compras-item-nome').textContent;
  const estaSeparado = state.separados.has(chave);

  const confirmado = await pedirConfirmacao(mensagemConfirmacao(nome, estaSeparado));
  if (!confirmado) return;

  const sucesso = await ItensSeparadosRepository.toggle(state.eventoAtual.id, chave, estaSeparado);
  if (!sucesso) return;

  estaSeparado ? state.separados.delete(chave) : state.separados.add(chave);
  elemento.classList.toggle('separado');
}

// Admin: edita a quantidade de um item. Se for automático, a edição vira um
// "ajuste" salvo por cima do cálculo (o cálculo em si nunca é alterado);
// se for extra, atualiza a quantidade direto no registro do item.
async function editarQuantidade(botao) {
  if (!isAdmin()) return;

  const chave = botao.dataset.chave;
  const nome = botao.dataset.nome;
  const quantidadeAtual = Number(botao.dataset.quantidade);

  const novaQuantidade = await pedirValorNumerico(`Nova quantidade para "${nome}"`, quantidadeAtual);
  if (novaQuantidade === null) return;

  if (chave.startsWith('extra-')) {
    const id = Number(chave.slice('extra-'.length));
    const atualizado = await ItensExtrasRepository.atualizarQuantidade(id, novaQuantidade);
    if (!atualizado) return;
    state.extras = state.extras.map(e => e.id === id ? { ...e, quantidade: novaQuantidade } : e);
  } else {
    const salvo = await AjustesRepository.salvar(state.eventoAtual.id, chave, novaQuantidade);
    if (!salvo) return;
    state.ajustes.set(chave, novaQuantidade);
  }

  atualizarTela();
}

// Admin: remove um item extra da lista. Itens automáticos não podem ser
// removidos — só têm a quantidade ajustada, já que refletem o pedido.
async function removerItemExtra(botao) {
  const id = Number(botao.dataset.id);
  const nome = botao.dataset.nome;

  const sucesso = await confirmarEExcluir(
    `Remover "${nome}" da lista de compras?`,
    () => ItensExtrasRepository.remove(id)
  );
  if (!sucesso) return;

  state.extras = state.extras.filter(e => e.id !== id);
  atualizarTela();
}

function limparFormularioNovoItem() {
  $('lista-compras-novo-item-nome').value = '';
  $('lista-compras-novo-item-qtd').value = '';
  $('lista-compras-novo-item-unidade').value = '';
}

// Admin: adiciona à lista um material que não foi gerado automaticamente.
async function adicionarItemExtra() {
  if (!isAdmin()) return;

  const nome = $('lista-compras-novo-item-nome').value.trim();
  const quantidade = Number($('lista-compras-novo-item-qtd').value) || 0;
  const unidade = $('lista-compras-novo-item-unidade').value.trim() || 'un';

  if (!nome) {
    alert('Informe o nome do item.');
    return;
  }

  const novoItem = await ItensExtrasRepository.add(state.eventoAtual.id, { nome, quantidade, unidade });
  if (!novoItem) return;

  state.extras.push(novoItem);
  limparFormularioNovoItem();
  atualizarTela();
}

function aoClicarItens(event) {
  const botaoRemover = event.target.closest('.compras-item-remover');
  if (botaoRemover) return removerItemExtra(botaoRemover);

  const botaoEditar = event.target.closest('.compras-item-editar');
  if (botaoEditar) return editarQuantidade(botaoEditar);

  const item = event.target.closest('.compras-item');
  if (item) toggleItemSeparado(item);
}

function init() {
  $('lista-compras-itens').addEventListener('click', aoClicarItens);
  $('btn-adicionar-item-lista-compras').addEventListener('click', adicionarItemExtra);

  $('btn-copiar-lista-compras').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.textoAtual); alert('Copiado!'); }
    catch { alert('Selecione manualmente.'); }
  });
}

export const ListaCompras = { init, abrir };
