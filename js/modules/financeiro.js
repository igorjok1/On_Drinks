import { goToScreen } from '../utils/navigation.js';
import { formatarMoeda, formatarDataExtenso } from '../utils/formatters.js';
import { criarRepositorioSupabase } from '../utils/repository.js';
import { supabase } from '../utils/supabaseClient.js';
import { enviarArquivo } from '../utils/uploads.js';
import { getUsuarioAtual } from '../utils/auth.js';
import { EventosRepository } from './eventos.js';
import { filtrarPorTexto, criarControladorBusca } from '../utils/busca.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { criarSeletorDeArquivo } from '../utils/seletorDeArquivo.js';
import { $ } from '../utils/dom.js';

/* =========================================================================
 * CONSTANTES
 * ========================================================================= */
const TABELA_GASTOS = 'financeiro_gastos';
const BUCKET_COMPROVANTES = 'comprovantes';

const SELETORES = {
  totalFaturado: 'finance-summary-total',
  totalGastos: 'finance-summary-gastos',
  totalAReceber: 'finance-summary-a-receber',
  lucroLiquido: 'finance-summary-lucro',
  lista: 'finance-list',
  buscaInput: 'finance-search',
  periodoSelect: 'finance-periodo-select',
  graficoGanhosCanvas: 'finance-chart-ganhos',
  graficoGastosCanvas: 'finance-chart-gastos',
  rotuloPeriodoGastos: 'finance-periodo-atual-label',
  telaGasto: 'screen-financeiro-gasto',
  telaGastoAnterior: 'screen-financeiro',
  gastoDescricaoInput: 'gasto-descricao-input',
  gastoTipoSelect: 'gasto-tipo-select',
  gastoValorInput: 'gasto-valor-input',
  gastoDataInput: 'gasto-data-input',
  gastoComprovantePreview: 'gasto-comprovante-preview',
  gastoComprovanteInput: 'gasto-comprovante-input',
  btnSalvarGasto: 'btn-save-gasto',
  btnCancelarGasto: 'btn-cancel-gasto'
};

const ACOES = {
  abrirFormularioGasto: 'abrir-form-gasto',
  removerGasto: 'remover-gasto',
  removerPedido: 'remover-pedido',
  faturarEntrada: 'faturar-entrada',
  faturarSaldo: 'faturar-saldo'
};

const PERIODOS = { DIA: 'dia', SEMANA: 'semana', MES: 'mes', ANO: 'ano', TUDO: 'tudo' };
const PERIODO_PADRAO = PERIODOS.MES;

const ROTULOS_PERIODO_ATUAL = {
  [PERIODOS.DIA]: 'hoje',
  [PERIODOS.SEMANA]: 'esta semana',
  [PERIODOS.MES]: 'este mês',
  [PERIODOS.ANO]: 'este ano',
  [PERIODOS.TUDO]: 'todo o período'
};

const CATEGORIAS_GASTO_PADRAO = [
  { valor: 'insumos', rotulo: 'Insumos' },
  { valor: 'transporte', rotulo: 'Transporte' },
  { valor: 'equipe', rotulo: 'Equipe' },
  { valor: 'equipamentos', rotulo: 'Equipamentos' },
  { valor: 'outros', rotulo: 'Outros' }
];
const CATEGORIA_PADRAO = 'outros';

/* =========================================================================
 * ENTIDADES
 * ========================================================================= */

/** Registro de "isso foi faturado", com a data/hora em que aconteceu. */
function criarRegistroFaturamento() {
  return { data: new Date().toISOString() };
}

/**
 * Valida e monta os dados de um gasto novo. Retorna null quando os dados
 * são inválidos, deixando para quem chamou decidir como reagir.
 */
function criarGasto({ descricao, valor, data, categoria, comprovanteUrl }) {
  const descricaoValida = (descricao || '').trim();
  const valorValido = Number(valor);

  if (!(descricaoValida.length > 0 && valorValido > 0)) return null;

  return {
    descricao: descricaoValida,
    valor: valorValido,
    data: data || new Date().toISOString().slice(0, 10),
    categoria: categoriaValida(categoria),
    comprovante: comprovanteUrl || ''
  };
}

function categoriaValida(categoria) {
  const existe = CATEGORIAS_GASTO_PADRAO.some(item => item.valor === categoria);
  return existe ? categoria : CATEGORIA_PADRAO;
}

function rotuloCategoria(categoria) {
  const encontrada = CATEGORIAS_GASTO_PADRAO.find(item => item.valor === categoria)
    || CATEGORIAS_GASTO_PADRAO.find(item => item.valor === CATEGORIA_PADRAO);
  return encontrada ? encontrada.rotulo : '';
}

/* =========================================================================
 * REPOSITÓRIO DE GASTOS
 * Gastos são filhos de um evento (financeiro_gastos.evento_id), por isso
 * ganham um repositório próprio em vez do genérico — mas seguem a mesma
 * ideia de cache local + realtime dos demais.
 * ========================================================================= */
const GastosRepository = (() => {
  let porEvento = new Map();
  const ouvintes = new Set();

  const notificar = () => ouvintes.forEach(cb => cb());

  function agrupar(linhas) {
    const mapa = new Map();
    linhas.forEach(linha => {
      const lista = mapa.get(linha.evento_id) || [];
      lista.push({ id: linha.id, ...linha.dados });
      mapa.set(linha.evento_id, lista);
    });
    return mapa;
  }

  async function carregar() {
    const { data, error } = await supabase.from(TABELA_GASTOS).select('id, evento_id, dados').order('id');
    if (error) {
      console.error('[financeiro_gastos] erro ao carregar:', error.message);
      porEvento = new Map();
    } else {
      porEvento = agrupar(data);
    }
    notificar();
  }

  function assinarRealtime() {
    supabase
      .channel('realtime:financeiro_gastos')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABELA_GASTOS }, carregar)
      .subscribe();
  }

  return {
    async init() {
      await carregar();
      assinarRealtime();
    },
    assinar(callback) {
      ouvintes.add(callback);
      return () => ouvintes.delete(callback);
    },
    doEvento: eventoId => porEvento.get(eventoId) || [],

    async adicionar(eventoId, gasto) {
      const { data, error } = await supabase
        .from(TABELA_GASTOS)
        .insert({ evento_id: eventoId, dados: gasto, criado_por: getUsuarioAtual()?.id })
        .select('id, evento_id, dados')
        .single();

      if (error) {
        console.error('[financeiro_gastos] erro ao adicionar:', error.message);
        return false;
      }

      const lista = porEvento.get(eventoId) || [];
      lista.push({ id: data.id, ...data.dados });
      porEvento.set(eventoId, lista);
      notificar();
      return true;
    },

    /** A política de RLS da tabela só deixa admins excluírem de verdade. */
    async remover(eventoId, gastoId) {
      const { error } = await supabase.from(TABELA_GASTOS).delete().eq('id', gastoId);
      if (error) {
        console.error('[financeiro_gastos] erro ao excluir:', error.message);
        return false;
      }

      porEvento.set(eventoId, (porEvento.get(eventoId) || []).filter(g => g.id !== gastoId));
      notificar();
      return true;
    }
  };
})();

/* =========================================================================
 * REPOSITÓRIO DE PEDIDOS (FINANCEIRO)
 * Cópia PRÓPRIA dos dados financeiros do pedido — não é mais uma leitura
 * direta de EventosRepository. Isso existe porque o Financeiro é o livro-
 * caixa da empresa (registro de entradas e saídas) e não pode sumir só
 * porque um evento foi excluído da Agenda; ver SincronizadorFinanceiro logo
 * abaixo, que é quem mantém os dois lados em dia.
 * ========================================================================= */
const FinanceiroPedidosRepository = criarRepositorioSupabase('financeiro_pedidos');
class FinanceiroRepository {
  constructor(pedidosRepositorio, gastosRepositorio) {
    this._pedidosRepositorio = pedidosRepositorio;
    this._gastosRepositorio = gastosRepositorio;
  }

  /** Repassa as mudanças do repositório de pedidos — o controlador não
   *  precisa conhecer FinanceiroPedidosRepository diretamente. */
  assinar(callback) {
    return this._pedidosRepositorio.assinar(callback);
  }

  listarTodos() {
    return this._pedidosRepositorio.getAll()
      .filter(FinanceiroCalculos.possuiValorLancado)
      .map(pedido => ({ ...pedido, gastos: this._gastosRepositorio.doEvento(pedido.id) }));
  }

  buscarPorId(pedidoId) {
    return this.listarTodos().find(pedido => pedido.id === pedidoId) || null;
  }

  async adicionarGasto(pedidoId, dadosGasto) {
    const gasto = criarGasto(dadosGasto);
    if (!gasto) return false;
    return this._gastosRepositorio.adicionar(pedidoId, gasto);
  }

  async removerGasto(pedidoId, gastoId) {
    return this._gastosRepositorio.remover(pedidoId, gastoId);
  }

  /** Exclui o registro financeiro e os gastos lançados nele — mas nunca
   *  o evento correspondente na Agenda, que é uma entidade independente
   *  a partir de agora. A política de RLS do Supabase só deixa admins
   *  excluírem de verdade. */
  async removerPedido(pedidoId) {
    const pedido = this.buscarPorId(pedidoId);
    const removido = await this._pedidosRepositorio.remove(pedidoId);
    if (removido && pedido) {
      await Promise.all(pedido.gastos.map(gasto => this._gastosRepositorio.remover(pedidoId, gasto.id)));
    }
    return removido;
  }

  async faturarEntrada(pedidoId) {
    const pedido = this.buscarPorId(pedidoId);
    const podeFaturar = pedido && !pedido.entradaFaturada && (pedido.valorEntrada || 0) > 0;
    if (!podeFaturar) return false;

    return this._pedidosRepositorio.update(pedidoId, { entradaFaturada: criarRegistroFaturamento() });
  }

  async faturarSaldo(pedidoId) {
    const pedido = this.buscarPorId(pedidoId);
    if (!pedido || pedido.saldoFaturado) return false;

    const { saldoPendente } = FinanceiroCalculos.calcularResumoPedido(pedido);
    if (!(saldoPendente > 0)) return false;

    return this._pedidosRepositorio.update(pedidoId, { saldoFaturado: criarRegistroFaturamento() });
  }
}

/* =========================================================================
 * SINCRONIZAÇÃO AGENDA → FINANCEIRO
 * Mantém FinanceiroPedidosRepository em dia com o que acontece em
 * EventosRepository (Agenda) — mas só em uma direção e só pra frente:
 * cria o registro financeiro na primeira vez que um pedido tem valor
 * lançado, e atualiza os campos financeiros quando eles mudam. Exclusão
 * de evento na Agenda nunca é replicada aqui de propósito — é isso que
 * torna o Financeiro um livro-caixa independente.
 * ========================================================================= */
// Não inclui entradaFaturada/saldoFaturado de propósito: esses campos são
// de propriedade exclusiva do Financeiro (setados por faturarEntrada() e
// faturarSaldo() abaixo). O evento na Agenda nunca tem esses campos, então
// incluí-los aqui fazia a sincronização apagar o faturamento sempre que
// QUALQUER evento mudasse — bug corrigido em 2026-08.
const CAMPOS_FINANCEIROS_DO_EVENTO = ['cliente', 'dataEvento', 'valorContrato', 'valorEntrada'];

function extrairDadosFinanceiros(evento) {
  const dados = { eventoOrigemId: evento.id };
  CAMPOS_FINANCEIROS_DO_EVENTO.forEach(campo => { dados[campo] = evento[campo]; });
  return dados;
}

function dadosFinanceirosMudaram(pedidoFinanceiro, dadosNovos) {
  return CAMPOS_FINANCEIROS_DO_EVENTO.some(
    campo => JSON.stringify(pedidoFinanceiro[campo]) !== JSON.stringify(dadosNovos[campo])
  );
}

const SincronizadorFinanceiro = {
  async sincronizar(eventos) {
    const comValorLancado = eventos.filter(FinanceiroCalculos.possuiValorLancado);
    await Promise.all(comValorLancado.map(evento => this._sincronizarUm(evento)));
  },

  async _sincronizarUm(evento) {
    const dadosNovos = extrairDadosFinanceiros(evento);
    const existente = FinanceiroPedidosRepository.getAll().find(p => p.eventoOrigemId === evento.id);

    if (!existente) {
      await FinanceiroPedidosRepository.add(dadosNovos);
    } else if (dadosFinanceirosMudaram(existente, dadosNovos)) {
      await FinanceiroPedidosRepository.update(existente.id, dadosNovos);
    }
  }
};

/* =========================================================================
 * CÁLCULOS (funções puras, sem efeito colateral)
 * ========================================================================= */
const FinanceiroCalculos = {
  calcularResumoPedido(pedido) {
    const totalGastos = pedido.gastos.reduce((soma, gasto) => soma + gasto.valor, 0);
    const saldoPendente = (pedido.valorContrato || 0) - (pedido.valorEntrada || 0);

    const valorEntradaFaturado = pedido.entradaFaturada ? (pedido.valorEntrada || 0) : 0;
    const valorSaldoFaturado = pedido.saldoFaturado ? saldoPendente : 0;
    const valorFaturado = valorEntradaFaturado + valorSaldoFaturado;

    return {
      saldoPendente,
      totalGastos,
      valorFaturado,
      valorAReceber: (pedido.valorContrato || 0) - valorFaturado,
      lucroLiquido: valorFaturado - totalGastos
    };
  },

  calcularResumoGeral(pedidos) {
    return pedidos.reduce((resumo, pedido) => {
      const { totalGastos, valorFaturado, valorAReceber, lucroLiquido } = this.calcularResumoPedido(pedido);
      resumo.totalFaturado += valorFaturado;
      resumo.totalGastos += totalGastos;
      resumo.totalAReceber += valorAReceber;
      resumo.lucroLiquido += lucroLiquido;
      return resumo;
    }, { totalFaturado: 0, totalGastos: 0, totalAReceber: 0, lucroLiquido: 0 });
  },

  possuiValorLancado(pedido) {
    return (pedido.valorContrato || 0) > 0 || (pedido.valorEntrada || 0) > 0;
  }
};

/* =========================================================================
 * AGREGADOS PARA OS GRÁFICOS (funções puras)
 * ========================================================================= */
const FinanceiroAgregados = {
  /** Filtra os pedidos para os que pertencem ao período selecionado no topo
   *  da aba Financeiro — é esse recorte que passa a valer para o resumo,
   *  a lista de pedidos e os dois gráficos, todos derivados do mesmo
   *  conjunto de dados. "Todo o período" não filtra nada. */
  filtrarPedidosPorPeriodo(pedidos, periodo) {
    if (periodo === PERIODOS.TUDO) return pedidos;
    return pedidos.filter(pedido => this._estaNoPeriodoAtual(pedido.dataEvento, periodo));
  },

  _estaNoPeriodoAtual(dataISO, periodo) {
    if (!dataISO) return false;
    const hoje = new Date().toISOString().slice(0, 10);

    if (periodo === PERIODOS.DIA) return dataISO === hoje;
    if (periodo === PERIODOS.SEMANA) return this._chaveSemana(dataISO) === this._chaveSemana(hoje);
    if (periodo === PERIODOS.MES) return dataISO.slice(0, 7) === hoje.slice(0, 7);
    if (periodo === PERIODOS.ANO) return dataISO.slice(0, 4) === hoje.slice(0, 4);
    return true;
  },

  /** Recebe os pedidos já filtrados pelo período (ver filtrarPedidosPorPeriodo)
   *  e decide só o agrupamento (granularidade) das barras do gráfico:
   *  dentro de um dia/semana/mês faz sentido ver por dia; num ano ou no
   *  período todo, por mês. */
  agruparFaturamentoELucroPorPeriodo(pedidos, periodo) {
    const granularidade = this._granularidadeDoGrafico(periodo);
    const faturamentoPorChave = new Map();
    const lucroPorChave = new Map();

    pedidos.forEach(pedido => {
      const { totalGastos, valorFaturado, lucroLiquido } = FinanceiroCalculos.calcularResumoPedido(pedido);
      if (valorFaturado <= 0 && totalGastos <= 0) return;

      const chave = this._chavePeriodo(pedido.dataEvento, granularidade);
      faturamentoPorChave.set(chave, (faturamentoPorChave.get(chave) || 0) + valorFaturado);
      lucroPorChave.set(chave, (lucroPorChave.get(chave) || 0) + lucroLiquido);
    });

    const chaves = [...new Set([...faturamentoPorChave.keys(), ...lucroPorChave.keys()])].sort();

    return {
      rotulos: chaves.map(chave => this._rotuloPeriodo(chave, granularidade)),
      faturamento: chaves.map(chave => faturamentoPorChave.get(chave) || 0),
      lucroLiquido: chaves.map(chave => lucroPorChave.get(chave) || 0)
    };
  },

  _granularidadeDoGrafico(periodo) {
    if (periodo === PERIODOS.ANO || periodo === PERIODOS.TUDO) return PERIODOS.MES;
    return PERIODOS.DIA;
  },

  /** Soma os gastos de todos os pedidos recebidos, agrupando por categoria.
   *  Como os pedidos já chegam filtrados pelo período selecionado, não
   *  precisa mais casar uma "chave atual" — é só somar o que sobrou. */
  agruparGastosPorCategoria(pedidos) {
    const totaisPorCategoria = new Map();

    pedidos.forEach(pedido => {
      pedido.gastos.forEach(gasto => {
        const categoria = categoriaValida(gasto.categoria);
        totaisPorCategoria.set(categoria, (totaisPorCategoria.get(categoria) || 0) + gasto.valor);
      });
    });

    const resultado = {};
    [...totaisPorCategoria.keys()].sort().forEach(categoria => {
      resultado[rotuloCategoria(categoria)] = totaisPorCategoria.get(categoria);
    });
    return resultado;
  },

  _chavePeriodo(dataISO, periodo) {
    if (!dataISO) return 'sem-data';
    if (periodo === PERIODOS.MES) return dataISO.slice(0, 7);
    if (periodo === PERIODOS.SEMANA) return this._chaveSemana(dataISO);
    return dataISO;
  },

  _chaveSemana(dataISO) {
    const data = new Date(`${dataISO}T00:00:00`);
    data.setDate(data.getDate() + 3 - ((data.getDay() + 6) % 7));
    const primeiraQuinta = new Date(data.getFullYear(), 0, 4);
    const numeroSemana = 1 + Math.round(
      ((data - primeiraQuinta) / 86400000 - 3 + ((primeiraQuinta.getDay() + 6) % 7)) / 7
    );
    return `${data.getFullYear()}-S${String(numeroSemana).padStart(2, '0')}`;
  },

  _rotuloPeriodo(chave, periodo) {
    if (chave === 'sem-data') return 'Sem data';

    if (periodo === PERIODOS.MES) {
      const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const [ano, mes] = chave.split('-');
      return `${nomesMes[Number(mes) - 1]}/${ano.slice(2)}`;
    }

    if (periodo === PERIODOS.SEMANA) {
      const [ano, semana] = chave.split('-');
      return `${semana}/${ano.slice(2)}`;
    }

    const [, mes, dia] = chave.split('-');
    return `${dia}/${mes}`;
  }
};

/* =========================================================================
 * GRÁFICOS (ADAPTER)
 * ========================================================================= */
const CORES_GRAFICO = {
  texto: '#9c9184',
  grade: 'rgba(156, 145, 132, 0.12)',
  ganhos: '#d9a441',
  lucro: '#93a97a',
  categorias: ['#d9a441', '#c1443b', '#93a97a', '#f0c374', '#8f7a52', '#b8862f']
};

// Registrado uma única vez para o módulo inteiro: dá pra cada gráfico criado
// abaixo apenas ligar/configurar o plugin (ver _opcoesRotulosDeValor), sem
// repetir o registro por instância.
Chart.register(ChartDataLabels);

/** Regra de exibição dos rótulos de valor, compartilhada pelos dois
 *  gráficos: mesma formatação de moeda, e nenhum rótulo para valores
 *  zerados/negativos (evita poluir o gráfico com "R$ 0,00"). */
function formatarRotuloDeValor(valor) {
  return valor > 0 ? formatarMoeda(valor) : '';
}

class FinanceiroGraficos {
  constructor() {
    this._instanciaGanhos = null;
    this._instanciaGastos = null;
  }

  renderizarGraficoFaturamento(canvasId, dados) {
    const ctx = $(canvasId);
    if (!ctx) return;

    this._destruirSeExistir('_instanciaGanhos');
    this._instanciaGanhos = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [
          { label: 'Faturamento', data: dados.faturamento, backgroundColor: CORES_GRAFICO.ganhos, borderRadius: 4 },
          { label: 'Lucro líquido', data: dados.lucroLiquido, backgroundColor: CORES_GRAFICO.lucro, borderRadius: 4 }
        ]
      },
      options: this._obterOpcoesBarra()
    });
  }

  renderizarGraficoGastos(canvasId, dadosAgrupados) {
    const ctx = $(canvasId);
    if (!ctx) return;

    this._destruirSeExistir('_instanciaGastos');
    this._instanciaGastos = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: Object.keys(dadosAgrupados),
        datasets: [{
          data: Object.values(dadosAgrupados),
          backgroundColor: CORES_GRAFICO.categorias,
          borderColor: '#0c0a08',
          borderWidth: 2
        }]
      },
      options: this._obterOpcoesPizza()
    });
  }

  _destruirSeExistir(propriedadeInstancia) {
    if (this[propriedadeInstancia]) this[propriedadeInstancia].destroy();
  }

  _obterOpcoesBarra() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: CORES_GRAFICO.texto, boxWidth: 12, padding: 12 } },
        datalabels: this._opcoesRotulosDeValor({ anchor: 'end', align: 'top', color: CORES_GRAFICO.texto })
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: CORES_GRAFICO.texto }, grid: { color: CORES_GRAFICO.grade } },
        x: { ticks: { color: CORES_GRAFICO.texto }, grid: { display: false } }
      }
    };
  }

  _obterOpcoesPizza() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: CORES_GRAFICO.texto, boxWidth: 12, padding: 12 } },
        datalabels: this._opcoesRotulosDeValor({
          color: '#0c0a08',
          backgroundColor: 'rgba(240, 230, 210, 0.85)',
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 5, right: 5 }
        })
      }
    };
  }

  /** Opções do plugin datalabels comuns aos dois gráficos: cada chamador só
   *  passa o que muda entre eles (posição/cor), enquanto a formatação do
   *  valor e a regra de "não mostrar rótulo sem valor" ficam num só lugar. */
  _opcoesRotulosDeValor(opcoesEspecificas) {
    return {
      display: contexto => contexto.dataset.data[contexto.dataIndex] > 0,
      formatter: formatarRotuloDeValor,
      font: { weight: '600', size: 11 },
      ...opcoesEspecificas
    };
  }
}

/* =========================================================================
 * VISUALIZAÇÃO (TEMPLATES)
 * ========================================================================= */
const FinanceiroView = {
  _formatarDataHora(iso) {
    const data = new Date(iso);
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${data.toLocaleDateString('pt-BR')} ${hora}`;
  },

  _blocoFaturamento({ valor, faturado, rotulo, acao, pedidoId }) {
    if (!(valor > 0)) return '';

    if (faturado) {
      return `<div class="finance-faturado-info">✓ ${rotulo} de ${formatarMoeda(valor)} faturado em ${this._formatarDataHora(faturado.data)}</div>`;
    }

    return `
      <button type="button" class="btn-secondary finance-btn finance-faturar-btn"
        data-acao="${acao}" data-pedido-id="${pedidoId}">
        Faturar ${rotulo.toLowerCase()} de ${formatarMoeda(valor)}
      </button>`;
  },

  cardPedido(pedido) {
    const dataFormatada = pedido.dataEvento
      ? formatarDataExtenso(pedido.dataEvento)
      : 'Data não informada';

    const resumo = FinanceiroCalculos.calcularResumoPedido(pedido);

    const blocoFaturamentoEntrada = this._blocoFaturamento({
      valor: pedido.valorEntrada, faturado: pedido.entradaFaturada,
      rotulo: 'Entrada', acao: ACOES.faturarEntrada, pedidoId: pedido.id
    });

    const blocoFaturamentoSaldo = this._blocoFaturamento({
      valor: resumo.saldoPendente, faturado: pedido.saldoFaturado,
      rotulo: 'Saldo', acao: ACOES.faturarSaldo, pedidoId: pedido.id
    });

    const listaGastosHtml = pedido.gastos.length === 0
      ? '<li class="finance-gasto-vazio">Nenhum gasto lançado para este evento.</li>'
      : pedido.gastos
          .slice()
          .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
          .map(gasto => `
            <li class="finance-gasto-item">
              <span class="finance-gasto-categoria">${rotuloCategoria(gasto.categoria)}</span>
              <span class="finance-gasto-descricao">${gasto.comprovante ? '📎 ' : ''}${gasto.descricao}</span>
              <span class="finance-gasto-valor">${formatarMoeda(gasto.valor)}</span>
              <button type="button" class="finance-gasto-remover" data-admin-only
                data-acao="${ACOES.removerGasto}"
                data-pedido-id="${pedido.id}"
                data-gasto-id="${gasto.id}"
                aria-label="Remover gasto">×</button>
            </li>`)
          .join('');

    return `
      <div class="finance-card">
        <div class="finance-card-header">
          <div class="finance-card-header-info">
            <div class="finance-card-cliente">${pedido.cliente}</div>
            <div class="finance-card-data">${dataFormatada}</div>
          </div>
          <button type="button" class="btn-excluir-evento" data-admin-only
            data-acao="${ACOES.removerPedido}" data-pedido-id="${pedido.id}">Excluir</button>
        </div>

        <div class="finance-row">
          <span class="finance-row-label">Valor do contrato</span>
          <span class="finance-row-valor">${formatarMoeda(pedido.valorContrato)}</span>
        </div>
        <div class="finance-row">
          <span class="finance-row-label">Entrada</span>
          <span class="finance-row-valor">${formatarMoeda(pedido.valorEntrada)}</span>
        </div>
        ${blocoFaturamentoEntrada}
        <div class="finance-row">
          <span class="finance-row-label">Saldo pendente</span>
          <span class="finance-badge">${formatarMoeda(resumo.saldoPendente)}</span>
        </div>
        ${blocoFaturamentoSaldo}

        <div class="finance-gastos-section">
          <div class="finance-gastos-header">
            <span class="finance-row-label">Gastos do evento</span>
            <button type="button" class="finance-gasto-toggle"
              data-acao="${ACOES.abrirFormularioGasto}" data-pedido-id="${pedido.id}">
              + Adicionar gasto
            </button>
          </div>

          <ul class="finance-gastos-lista">${listaGastosHtml}</ul>

          <div class="finance-row">
            <span class="finance-row-label">Total de gastos</span>
            <span class="finance-row-valor">${formatarMoeda(resumo.totalGastos)}</span>
          </div>
          <div class="finance-row">
            <span class="finance-row-label">Lucro líquido</span>
            <span class="finance-badge">${formatarMoeda(resumo.lucroLiquido)}</span>
          </div>
        </div>
      </div>`;
  },

  listaPedidos(pedidos, temBusca) {
    if (pedidos.length === 0) {
      return temBusca
        ? '<p class="empty-state">Nenhum pedido encontrado para essa busca.</p>'
        : '<p class="empty-state">Nenhum pedido com valores lançados ainda.</p>';
    }

    return pedidos
      .slice()
      .sort((a, b) => (b.dataEvento || '').localeCompare(a.dataEvento || ''))
      .map(pedido => this.cardPedido(pedido))
      .join('');
  },

  opcoesCategoria() {
    return CATEGORIAS_GASTO_PADRAO
      .map(categoria => `<option value="${categoria.valor}">${categoria.rotulo}</option>`)
      .join('');
  }
};

/* =========================================================================
 * CONTROLADOR
 * ========================================================================= */
class FinanceiroController {
  constructor(repositorio, graficos) {
    this._repositorio = repositorio;
    this._graficos = graficos;
    this._periodoAtual = PERIODO_PADRAO;
    this._pedidoIdEmEdicao = null;
    this._busca = criarControladorBusca(SELETORES.buscaInput, () => this._renderizar());
    this._comprovante = criarSeletorDeArquivo({
      previewId: SELETORES.gastoComprovantePreview,
      inputId: SELETORES.gastoComprovanteInput
    });
  }

  iniciar() {
    const lista = this._elementoLista();
    lista.addEventListener('click', evento => this._aoClicar(evento));

    this._busca.init();
    this._configurarSeletorPeriodo();
    this._configurarTelaDeGasto();

    // Redesenha sempre que pedidos financeiros ou gastos mudarem — inclusive
    // quando a mudança vier de outro usuário conectado (via realtime).
    this._repositorio.assinar(() => this._renderizar());
    GastosRepository.assinar(() => this._renderizar());

    this._renderizar();
  }

  _configurarSeletorPeriodo() {
    const seletor = this._elementoSeletorPeriodo();
    if (!seletor) return;

    seletor.value = this._periodoAtual;
    seletor.addEventListener('change', evento => this._aoMudarPeriodo(evento));
  }

  _configurarTelaDeGasto() {
    this._comprovante.init();

    const btnSalvar = $(SELETORES.btnSalvarGasto);
    const btnCancelar = $(SELETORES.btnCancelarGasto);

    if (btnSalvar) btnSalvar.addEventListener('click', () => this._aoSalvarGasto());
    if (btnCancelar) btnCancelar.addEventListener('click', () => this._resetarTelaDeGasto());
  }

  _aoMudarPeriodo(evento) {
    this._periodoAtual = evento.target.value;
    this._renderizar();
  }

  async _aoClicar(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;

    const { acao, pedidoId, gastoId } = botao.dataset;
    const idPedido = Number(pedidoId);

    if (acao === ACOES.abrirFormularioGasto) {
      this._abrirTelaDeGasto(idPedido);
      return;
    }

    if (acao === ACOES.removerGasto) {
      await confirmarEExcluir(
        'Excluir este gasto? Essa ação não pode ser desfeita.',
        () => this._repositorio.removerGasto(idPedido, Number(gastoId))
      );
      return;
    }

    if (acao === ACOES.removerPedido) {
      await confirmarEExcluir(
        'Excluir este pedido do financeiro? Essa ação não pode ser desfeita.',
        () => this._repositorio.removerPedido(idPedido)
      );
      return;
    }

    if (acao === ACOES.faturarEntrada) await this._repositorio.faturarEntrada(idPedido);
    if (acao === ACOES.faturarSaldo) await this._repositorio.faturarSaldo(idPedido);

    this._renderizar();
  }

  _abrirTelaDeGasto(pedidoId) {
    this._pedidoIdEmEdicao = pedidoId;
    this._resetarCamposDoFormulario();
    this._atualizarOpcoesDeTipo();
    goToScreen(SELETORES.telaGasto);
  }

  _atualizarOpcoesDeTipo(tipoSelecionado) {
    const select = $(SELETORES.gastoTipoSelect);
    if (!select) return;

    select.innerHTML = FinanceiroView.opcoesCategoria();
    if (tipoSelecionado) select.value = tipoSelecionado;
  }

  async _aoSalvarGasto() {
    const btnSalvar = $(SELETORES.btnSalvarGasto);
    btnSalvar.disabled = true;

    const arquivoComprovante = this._comprovante.obterArquivo();
    const comprovanteUrl = arquivoComprovante
      ? await enviarArquivo(BUCKET_COMPROVANTES, arquivoComprovante)
      : '';

    const gastoFoiSalvo = await this._repositorio.adicionarGasto(this._pedidoIdEmEdicao, {
      descricao: $(SELETORES.gastoDescricaoInput).value,
      valor: $(SELETORES.gastoValorInput).value,
      data: $(SELETORES.gastoDataInput).value,
      categoria: $(SELETORES.gastoTipoSelect).value,
      comprovanteUrl
    });

    btnSalvar.disabled = false;

    if (!gastoFoiSalvo) {
      alert('Informe a descrição e um valor válido para o gasto.');
      return;
    }

    this._resetarTelaDeGasto();
    goToScreen(SELETORES.telaGastoAnterior);
    this._renderizar();
  }

  _resetarTelaDeGasto() {
    this._pedidoIdEmEdicao = null;
    this._resetarCamposDoFormulario();
  }

  _resetarCamposDoFormulario() {
    $(SELETORES.gastoDescricaoInput).value = '';
    $(SELETORES.gastoValorInput).value = '';
    $(SELETORES.gastoDataInput).value = new Date().toISOString().slice(0, 10);
    this._comprovante.reset();
  }

  _renderizar() {
    const pedidos = this._repositorio.listarTodos();
    const pedidosDoPeriodo = FinanceiroAgregados.filtrarPedidosPorPeriodo(pedidos, this._periodoAtual);
    const pedidosFiltrados = filtrarPorTexto(pedidosDoPeriodo, this._busca.obterTermo(), pedido => pedido.cliente);
    const temBusca = this._busca.obterTermo().trim().length > 0;

    this._elementoLista().innerHTML = FinanceiroView.listaPedidos(pedidosFiltrados, temBusca);
    this._atualizarResumo(pedidosDoPeriodo);
    this._renderizarGraficos(pedidosDoPeriodo);
  }

  _atualizarResumo(pedidos) {
    const resumo = FinanceiroCalculos.calcularResumoGeral(pedidos);

    [
      [SELETORES.totalFaturado, resumo.totalFaturado],
      [SELETORES.totalGastos, resumo.totalGastos],
      [SELETORES.totalAReceber, resumo.totalAReceber],
      [SELETORES.lucroLiquido, resumo.lucroLiquido]
    ].forEach(([idElemento, valor]) => {
      const elemento = $(idElemento);
      if (elemento) elemento.textContent = formatarMoeda(valor);
    });
  }

  _renderizarGraficos(pedidos) {
    const faturamentoELucro = FinanceiroAgregados.agruparFaturamentoELucroPorPeriodo(pedidos, this._periodoAtual);
    const gastosPorCategoria = FinanceiroAgregados.agruparGastosPorCategoria(pedidos);

    this._graficos.renderizarGraficoFaturamento(SELETORES.graficoGanhosCanvas, faturamentoELucro);
    this._graficos.renderizarGraficoGastos(SELETORES.graficoGastosCanvas, gastosPorCategoria);

    this._atualizarRotuloPeriodoGastos();
  }

  _atualizarRotuloPeriodoGastos() {
    const elemento = $(SELETORES.rotuloPeriodoGastos);
    if (!elemento) return;
    elemento.textContent = `Gastos por categoria — ${ROTULOS_PERIODO_ATUAL[this._periodoAtual]}`;
  }

  _elementoLista() {
    return $(SELETORES.lista);
  }

  _elementoSeletorPeriodo() {
    return $(SELETORES.periodoSelect);
  }
}

/* =========================================================================
 * PONTO DE ENTRADA DO MÓDULO
 * ========================================================================= */
export const Financeiro = {
  async init() {
    await GastosRepository.init();
    await FinanceiroPedidosRepository.init();

    // Traz o que já existe na Agenda pra dentro do Financeiro e passa a
    // acompanhar toda nova criação/edição de pedido — sem propagar exclusões.
    // Não chama EventosRepository.init() aqui: quem já faz isso é o próprio
    // módulo de Eventos, então só nos inscrevemos nas mudanças dele.
    await SincronizadorFinanceiro.sincronizar(EventosRepository.getAll());
    EventosRepository.assinar(eventos => SincronizadorFinanceiro.sincronizar(eventos));

    const repositorio = new FinanceiroRepository(FinanceiroPedidosRepository, GastosRepository);
    const graficos = new FinanceiroGraficos();
    const controlador = new FinanceiroController(repositorio, graficos);
    controlador.iniciar();
  }
};