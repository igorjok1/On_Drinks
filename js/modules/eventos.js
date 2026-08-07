import { EventBus } from '../utils/eventBus.js';
import { parseDataLocal, formatarDataExtenso, diferencaEmDias, NOMES_MES } from '../utils/formatters.js';
import { montarResumoPedido } from '../utils/resumoPedido.js';
import { criarRepositorioSupabase } from '../utils/repository.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { ListaCompras } from './listaCompras.js';
import { Drinks } from './drinks.js';

const DIAS_PARA_DESTAQUE = 7;

// ---------- Repositório (única fonte de verdade + persistência) ----------
// Apoiado no Supabase (tabela "eventos"): cache local em memória, carregado
// no init() e mantido em dia por realtime. Exportado porque o Financeiro
// também consome (getAll/assinar) pra sincronizar seus próprios registros.
export const EventosRepository = criarRepositorioSupabase('eventos');

// ---------- Regras da agenda (separadas da renderização) ----------
function estaEmDestaque(evento) {
  if (!evento.dataEvento) return false;
  const dias = diferencaEmDias(evento.dataEvento);
  return dias !== null && dias >= 0 && dias <= DIAS_PARA_DESTAQUE;
}

function ordenarParaAgenda(eventos) {
  const futuros = eventos
    .filter(e => e.dataEvento && diferencaEmDias(e.dataEvento) >= 0)
    .sort((a, b) => a.dataEvento.localeCompare(b.dataEvento));

  const passados = eventos
    .filter(e => !e.dataEvento || diferencaEmDias(e.dataEvento) < 0)
    .sort((a, b) => (b.dataEvento || '').localeCompare(a.dataEvento || ''));

  return { futuros, passados };
}

// ---------- Renderização (só sabe transformar dado em HTML) ----------
function textoContagem(dias) {
  if (dias === 0) return 'É hoje!';
  if (dias === 1) return 'Falta 1 dia';
  return `Faltam ${dias} dias`;
}

function badgeData(dataISO) {
  const data = parseDataLocal(dataISO);
  if (!data) return { dia: '--', mes: '' };
  return { dia: String(data.getDate()).padStart(2, '0'), mes: NOMES_MES[data.getMonth()].slice(0, 3) };
}

// ---------- Detalhes do pedido (todos os dados informados em "Criar Pedido") ----------
function detalheItemHTML(linha) {
  return `
    <div class="evento-detalhe-item">
      <span class="evento-detalhe-label">${linha.label}</span>
      <span class="evento-detalhe-valor">${linha.valor}</span>
    </div>`;
}

function linhasDetalhes(evento) {
  // Cliente e Data já aparecem no cabeçalho do card, então não repetimos aqui.
  const omitidos = new Set(['Cliente', 'Data']);
  return montarResumoPedido(evento).filter(l => !omitidos.has(l.label));
}

function drinksSelecionadosHTML(evento) {
  const nomes = Drinks.getNomes(evento.drinksSelecionados);
  return nomes.length ? detalheItemHTML({ label: 'Drinks', valor: nomes.join(', ') }) : '';
}

function detalhesHTML(evento) {
  const linhas = linhasDetalhes(evento).map(detalheItemHTML).join('') + drinksSelecionadosHTML(evento);
  return linhas ? `<div class="evento-detalhes">${linhas}</div>` : '';
}

// ---------- Card do evento ----------
function cardEventoHTML(evento) {
  const destaque = estaEmDestaque(evento);
  const { dia, mes } = badgeData(evento.dataEvento);
  const dias = evento.dataEvento ? diferencaEmDias(evento.dataEvento) : null;

  return `
    <div class="evento-card ${destaque ? 'destaque' : ''}" data-id="${evento.id}">
      <div class="evento-data-badge">
        <span class="dia">${dia}</span>
        <span class="mes">${mes}</span>
      </div>
      <div class="evento-card-corpo">
        <div class="evento-cliente">${evento.cliente}</div>
        <div class="evento-info">${evento.dataEvento ? formatarDataExtenso(evento.dataEvento) : 'Data não informada'}</div>
        ${dias !== null && dias >= 0 ? `<div class="evento-contagem">${textoContagem(dias)}</div>` : ''}
        ${detalhesHTML(evento)}
        <div class="evento-card-acoes">
          <button type="button" class="btn-editar-evento" data-id="${evento.id}">Editar</button>
          <button type="button" class="btn-excluir-evento" data-admin-only data-id="${evento.id}">Excluir</button>
        </div>
      </div>
    </div>`;
}

function secaoHTML(titulo, eventos) {
  if (!eventos.length) return '';
  return `<div class="eventos-secao-titulo">${titulo}</div>${eventos.map(cardEventoHTML).join('')}`;
}

function render() {
  const container = document.getElementById('eventos-list');
  const todos = EventosRepository.getAll();

  if (!todos.length) {
    container.innerHTML = `<p class="empty-state">Nenhum evento cadastrado ainda.</p>`;
    return;
  }

  const { futuros, passados } = ordenarParaAgenda(todos);
  container.innerHTML = secaoHTML('Próximos eventos', futuros) + secaoHTML('Eventos passados', passados);
}

// ---------- Inicialização ----------
function abrirListaCompras(event) {
  const card = event.target.closest('.evento-card');
  if (!card) return;
  const evento = EventosRepository.getAll().find(e => e.id === Number(card.dataset.id));
  if (evento) ListaCompras.abrir(evento);
}

function abrirEdicao(event) {
  const botao = event.target.closest('.btn-editar-evento');
  if (!botao) return false;

  event.stopPropagation();
  const evento = EventosRepository.getAll().find(e => e.id === Number(botao.dataset.id));
  if (evento) EventBus.emit('pedido:editar', evento);
  return true;
}

/** A política de RLS da tabela só deixa admins excluírem de verdade —
 *  o data-admin-only no botão é só a camada visual, mesmo padrão de
 *  drinks.js e financeiro.js. */
function excluirEvento(event) {
  const botao = event.target.closest('.btn-excluir-evento');
  if (!botao) return false;

  event.stopPropagation();
  const evento = EventosRepository.getAll().find(e => e.id === Number(botao.dataset.id));
  if (evento) {
    confirmarEExcluir(
      `Excluir o evento de "${evento.cliente}"? Essa ação não pode ser desfeita.`,
      () => EventosRepository.remove(evento.id)
    );
  }
  return true;
}

function onCliqueLista(event) {
  if (abrirEdicao(event)) return;
  if (excluirEvento(event)) return;
  abrirListaCompras(event);
}

async function init() {
  document.getElementById('eventos-list').addEventListener('click', onCliqueLista);

  await EventosRepository.init();

  // Redesenha sempre que a lista mudar — inclusive quando a mudança vier
  // de outro usuário conectado (via realtime).
  EventosRepository.assinar(() => render());

  EventBus.on('pedido:criado', pedido => {
    EventosRepository.add(pedido);
  });

  EventBus.on('pedido:atualizado', pedido => {
    EventosRepository.update(pedido.id, pedido);
  });

  render();
}

export const Eventos = { init };
