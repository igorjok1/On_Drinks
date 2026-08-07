import { goToScreen } from '../utils/navigation.js';
import { formatarQuantidade } from '../utils/formatters.js';
import { montarResumoPedido } from '../utils/resumoPedido.js';
import { itensCaixaReserva, itensUtensiliosBartender } from '../data/itensFixosPedido.js';
import { pedirConfirmacao } from '../components/confirmacao.js';
import { supabase } from '../utils/supabaseClient.js';
import { isAdmin } from '../utils/auth.js';
import { Drinks } from './drinks.js';
import { $ } from '../utils/dom.js';

const TABELA_SEPARADOS = 'itens_separados';
const TABELA_AJUSTADOS = 'itens_ajustados';
const TABELA_EXTRAS = 'itens_extras';
const SECAO_ITENS_ADICIONAIS = 'Itens Adicionais';
const CONVIDADOS_BASE = 50; // insumos de cada drink são cadastrados "a cada 50 convidados"

const state = {
  textoAtual: '',
  eventoAtual: null,
  souAdmin: false,
  separados: new Set(),
  ajustes: new Map(),
  extras: []
};

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
  }
};

// ---------- Repositório de ajustes manuais de quantidade (somente admin grava — RLS no Supabase) ----------
const ItensAjustadosRepository = {
  async getMapa(eventoId) {
    const { data, error } = await supabase
      .from(TABELA_AJUSTADOS)
      .select('chave, quantidade')
      .eq('evento_id', eventoId);

    if (error) {
      console.error('Erro ao carregar ajustes de quantidade:', error.message);
      return new Map();
    }
    return new Map(data.map(linha => [linha.chave, Number(linha.quantidade)]));
  },

  async salvar(eventoId, chave, quantidade) {
    const { error } = await supabase
      .from(TABELA_AJUSTADOS)
      .upsert({ evento_id: eventoId, chave, quantidade }, { onConflict: 'evento_id,chave' });

    if (error) console.error('Erro ao salvar ajuste de quantidade:', error.message);
    return !error;
  }
};

// ---------- Repositório de itens extras cadastrados manualmente (somente admin grava — RLS no Supabase) ----------
const ItensExtrasRepository = {
  async getTodos(eventoId) {
    const { data, error } = await supabase
      .from(TABELA_EXTRAS)
      .select('*')
      .eq('evento_id', eventoId)
      .order('criado_em', { ascending: true });

    if (error) {
      console.error('Erro ao carregar itens extras:', error.message);
      return [];
    }
    return data;
  },

  async adicionar(eventoId, item) {
    const { error } = await supabase.from(TABELA_EXTRAS).insert({ evento_id: eventoId, ...item });
    if (error) console.error('Erro ao adicionar item extra:', error.message);
    return !error;
  },

  async remover(eventoId, id) {
    const { error } = await supabase.from(TABELA_EXTRAS).delete().eq('evento_id', eventoId).eq('id', id);
    if (error) console.error('Erro ao remover item extra:', error.message);
    return !error;
  }
};

// ---------- Realtime: um único canal cobre as três tabelas do pedido em aberto ----------
// (evita repetir a lógica de "trocar canal" três vezes; reabrir a lista de
// compras troca o canal pro evento novo)
function criarAssinanteRealtime(tabelas) {
  let canal = null;

  return (eventoId, callback) => {
    if (canal) supabase.removeChannel(canal);

    canal = supabase.channel(`realtime:lista-compras:${eventoId}`);
    tabelas.forEach(tabela => {
      canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela, filter: `evento_id=eq.${eventoId}` },
        callback
      );
    });
    canal.subscribe();
  };
}

const assinarMudancas = criarAssinanteRealtime([TABELA_SEPARADOS, TABELA_AJUSTADOS, TABELA_EXTRAS]);

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

const itemChave = (secaoTitulo, item) => `${secaoTitulo}|${item.nome}`;

// Sobrescreve a quantidade calculada pela quantidade que o admin ajustou manualmente,
// quando houver uma para a chave do item. Não mexe em mais nada do item.
function aplicarAjustes(itens, secaoTitulo, ajustes) {
  return itens.map(item => {
    const chave = itemChave(secaoTitulo, item);
    return ajustes.has(chave) ? { ...item, quantidade: ajustes.get(chave) } : item;
  });
}

// ---------- Seções da lista de compras: cada uma sabe só de onde vêm seus itens ----------
function montarSecoes(evento, ajustes, extras) {
  const secoesBase = [
    { titulo: 'Insumos dos Drinks', itens: calcularInsumosDrinks(evento) },
    { titulo: 'Caixa Reserva', itens: itensCaixaReserva() },
    { titulo: 'Utensílios Bartender', itens: itensUtensiliosBartender(evento.bartenders) },
    {
      titulo: SECAO_ITENS_ADICIONAIS,
      itens: extras.map(e => ({ nome: e.nome, quantidade: Number(e.quantidade), unidade: e.unidade, id: e.id }))
    }
  ];

  return secoesBase
    .map(secao => ({ ...secao, itens: aplicarAjustes(secao.itens, secao.titulo, ajustes) }))
    .filter(secao => secao.itens.length);
}

// Única fonte de verdade pras seções "de agora" — usada pra renderizar, copiar
// o texto e localizar um item ao editar, sempre a partir do state atual.
function getSecoesAtuais() {
  return montarSecoes(state.eventoAtual, state.ajustes, state.extras);
}

function encontrarItemPorChave(chave) {
  for (const secao of getSecoesAtuais()) {
    const item = secao.itens.find(i => itemChave(secao.titulo, i) === chave);
    if (item) return item;
  }
  return null;
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

function itemHTML(item, chave, separado, editavel) {
  const botaoEditar = editavel
    ? `<button type="button" class="compras-item-editar" data-chave="${chave}" aria-label="Editar quantidade">✎</button>`
    : '';
  const botaoRemover = editavel && item.id
    ? `<button type="button" class="compras-item-remover" data-id-extra="${item.id}" aria-label="Remover item">✕</button>`
    : '';

  return `
    <div class="compras-item ${separado ? 'separado' : ''}" data-chave="${chave}">
      <span class="compras-item-check" aria-hidden="true"></span>
      <span class="compras-item-nome">${item.nome}</span>
      <span class="compras-item-qtd">${formatarQuantidade(item.quantidade)} ${item.unidade}</span>
      ${botaoEditar}${botaoRemover}
    </div>`;
}

function secaoHTML(secao, editavel) {
  const itens = secao.itens
    .map(item => {
      const chave = itemChave(secao.titulo, item);
      return itemHTML(item, chave, state.separados.has(chave), editavel);
    })
    .join('');
  return `<div class="eventos-secao-titulo">${secao.titulo}</div>${itens}`;
}

function renderItens(secoes, editavel) {
  $('lista-compras-itens').innerHTML = secoes.length
    ? secoes.map(secao => secaoHTML(secao, editavel)).join('')
    : `<p class="empty-state">Nenhum item cadastrado para este pedido.</p>`;
}

// Mostra/esconde as ações exclusivas de admin que não ficam dentro da lista
// de itens (hoje só o botão de adicionar item).
function aplicarPermissaoAdmin(souAdmin) {
  const botaoAdicionar = $('btn-adicionar-item-compra');
  if (botaoAdicionar) botaoAdicionar.hidden = !souAdmin;
}

function render(evento, resumo, secoes) {
  $('lista-compras-subtitulo').textContent = `${evento.cliente} · ${evento.convidados || 0} convidados`;
  renderResumo(resumo);
  renderItens(secoes, state.souAdmin);
  aplicarPermissaoAdmin(state.souAdmin);
}

// Recalcula seções + texto de cópia a partir do state atual e redesenha só os
// itens (resumo e subtítulo não dependem de ajustes/extras).
function atualizarListaEExibir() {
  const secoes = getSecoesAtuais();
  renderItens(secoes, state.souAdmin);
  state.textoAtual = montarTexto(state.eventoAtual, montarResumoPedido(state.eventoAtual), secoes);
}

// ---------- API pública ----------
async function abrir(evento) {
  state.eventoAtual = evento;

  const [separados, ajustes, extras] = await Promise.all([
    ItensSeparadosRepository.getChaves(evento.id),
    ItensAjustadosRepository.getMapa(evento.id),
    ItensExtrasRepository.getTodos(evento.id)
  ]);
  state.souAdmin = isAdmin();
  state.separados = separados;
  state.ajustes = ajustes;
  state.extras = extras;

  const resumo = montarResumoPedido(evento);
  const secoes = getSecoesAtuais();
  render(evento, resumo, secoes);
  state.textoAtual = montarTexto(evento, resumo, secoes);
  goToScreen('screen-lista-compras');

  // Redesenha os itens sempre que outro usuário conectado marcar/desmarcar,
  // editar ou adicionar algo neste mesmo pedido — sem precisar recarregar a página.
  assinarMudancas(evento.id, async () => {
    const [separadosAtualizados, ajustesAtualizados, extrasAtualizados] = await Promise.all([
      ItensSeparadosRepository.getChaves(state.eventoAtual.id),
      ItensAjustadosRepository.getMapa(state.eventoAtual.id),
      ItensExtrasRepository.getTodos(state.eventoAtual.id)
    ]);
    state.separados = separadosAtualizados;
    state.ajustes = ajustesAtualizados;
    state.extras = extrasAtualizados;
    atualizarListaEExibir();
  });
}

function mensagemConfirmacao(nome, estaSeparado) {
  return estaSeparado
    ? `Desmarcar "${nome}" como separado?`
    : `Marcar "${nome}" como separado?`;
}

async function toggleItemSeparado(event) {
  const elemento = event.target.closest('.compras-item');
  if (!elemento) return;

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

// Converte texto digitado (aceita vírgula) numa quantidade válida, ou null se inválida.
function lerQuantidade(texto) {
  if (texto === null) return null;
  const quantidade = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(quantidade) && quantidade >= 0 ? quantidade : null;
}

async function editarQuantidade(chave) {
  if (!state.souAdmin) return;

  const item = encontrarItemPorChave(chave);
  if (!item) return;

  const texto = prompt(`Nova quantidade para "${item.nome}" (${item.unidade}):`, formatarQuantidade(item.quantidade));
  if (texto === null) return;

  const quantidade = lerQuantidade(texto);
  if (quantidade === null) {
    alert('Quantidade inválida.');
    return;
  }

  const sucesso = await ItensAjustadosRepository.salvar(state.eventoAtual.id, chave, quantidade);
  if (!sucesso) return;

  state.ajustes.set(chave, quantidade);
  atualizarListaEExibir();
}

async function removerItemExtra(idExtra) {
  if (!state.souAdmin) return;

  const confirmado = await pedirConfirmacao('Remover este item da lista?');
  if (!confirmado) return;

  const sucesso = await ItensExtrasRepository.remover(state.eventoAtual.id, idExtra);
  if (!sucesso) return;

  state.extras = state.extras.filter(extra => String(extra.id) !== String(idExtra));
  atualizarListaEExibir();
}

async function adicionarItem() {
  if (!state.souAdmin) return;

  const nome = prompt('Nome do item:');
  if (!nome?.trim()) return;

  const quantidade = lerQuantidade(prompt('Quantidade:'));
  if (quantidade === null) {
    alert('Quantidade inválida.');
    return;
  }

  const unidade = (prompt('Unidade (ex: un, kg, L):', 'un') || 'un').trim();

  const sucesso = await ItensExtrasRepository.adicionar(state.eventoAtual.id, {
    nome: nome.trim(),
    quantidade,
    unidade
  });
  if (!sucesso) return;

  state.extras = await ItensExtrasRepository.getTodos(state.eventoAtual.id);
  atualizarListaEExibir();
}

// Roteia o clique dentro da lista: editar/remover (admin) têm prioridade sobre
// marcar/desmarcar como separado, já que os botões ficam dentro do mesmo item.
async function onClickItens(event) {
  const botaoEditar = event.target.closest('.compras-item-editar');
  if (botaoEditar) return editarQuantidade(botaoEditar.dataset.chave);

  const botaoRemover = event.target.closest('.compras-item-remover');
  if (botaoRemover) return removerItemExtra(botaoRemover.dataset.idExtra);

  return toggleItemSeparado(event);
}

function init() {
  $('lista-compras-itens').addEventListener('click', onClickItens);

  $('btn-adicionar-item-compra')?.addEventListener('click', adicionarItem);

  $('btn-copiar-lista-compras').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.textoAtual); alert('Copiado!'); }
    catch { alert('Selecione manualmente.'); }
  });
}

export const ListaCompras = { init, abrir };
