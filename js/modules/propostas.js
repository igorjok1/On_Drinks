import { goToScreen } from '../utils/navigation.js';
import { formatarMoeda, formatarDataExtenso, diaDaSemanaExtenso, parseDataLocal, NOMES_MES } from '../utils/formatters.js';
import { criarRepositorioSupabase } from '../utils/repository.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { $ } from '../utils/dom.js';
// Ajuste este import para o caminho real do seu cliente Supabase (ex: o mesmo usado em repository.js)
import { supabase } from '../utils/supabaseClient.js';

// ---------- Repositório ----------
const PropostasRepository = criarRepositorioSupabase('propostas');

export const Propostas = (() => {
  const state = { detalheId: null, idEmEdicao: null };

  const val = id => $(id).value.trim();

  const TIPOS_EVENTO = {
    casamento: 'Casamento', aniversario: 'Aniversário', debutante: 'Festa de 15 Anos',
    formatura: 'Formatura', corporativo: 'Corporativo', outros: 'Outros'
  };

  const CARDAPIO_PADRAO = [
    { lead: 'Drinks Com Álcool:', texto: 'Gin Tônicas autorais, Caipirinhas gourmet com frutas frescas da estação e o clássico Moscow Mule com espuma artesanal de gengibre.' },
    { lead: 'Opções Sem Álcool:', texto: 'Mocktails sofisticados, elaborados com xaropes artesanais e especiarias finas para incluir e encantar todos os convidados.' },
    { lead: 'Insumos Premium:', texto: 'Gelo cristalino filtrado (alta durabilidade), frutas frescas selecionadas, destilados de primeira linha e aromatizantes nobres.' }
  ];

  const CONFIG = {
    casamento: {
      tituloSecao: 'Proposta: Casamento Exclusivo',
      abertura: 'O dia mais importante da sua vida merece uma experiência à altura. Mais do que servir drinks, criamos um ponto de encontro inesquecível para os seus convidados, unindo elegância, sabor e fluidez absoluta no grande dia. Para o dia ',
      sufixoData: d => ` (um ${d} perfeito para celebrar o amor), preparei uma curadoria exclusiva para `,
      corpo: ' convidados, focada em sofisticação e em uma operação impecável em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' especialistas de alto padrão para garantir atendimento ágil e cortês do início ao fim.',
      textoBalcao: 'Bar com design imponente e acabamento sofisticado (opções em madeira rústica ou espelhado premium).'
    },
    aniversario: {
      tituloSecao: 'Proposta: Aniversário Memorável',
      abertura: 'Uma data especial merece ser celebrada com estilo e sem preocupações. Nossa missão é transformar sua festa em um evento marcante, onde cada drink é uma atração à parte que surpreende os convidados. Para o dia ',
      sufixoData: d => ` (a data ideal para essa comemoração), estruturei uma proposta personalizada para `,
      corpo: ' convidados, unindo alta coquetelaria, agilidade e muita energia positiva em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' profissionais dinâmicos para manter o bar vibrante e sem filas durante toda a festa.',
      textoBalcao: 'Estrutura moderna, descontraída e visualmente deslumbrante para o clima da sua festa.'
    },
    debutante: {
      tituloSecao: 'Proposta: Festa de 15 Anos dos Sonhos',
      abertura: 'Um momento único que exige um toque de magia e modernidade. Desenvolvemos uma experiência de bar que é o centro das atenções da festa, com coquetéis alcoólicos refinados e mocktails coloridos e instagramáveis. Para o dia ',
      sufixoData: d => ` (uma data inesquecível), preparei uma proposta exclusiva para `,
      corpo: ' convidados, unindo charme, sabor e excelência em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' bartenders de alta performance para garantir um atendimento encantador e ágil.',
      textoBalcao: 'Estrutura temática e sofisticada, perfeitamente alinhada à cenografia da festa.'
    },
    formatura: {
      tituloSecao: 'Proposta: Formatura de Alto Padrão',
      abertura: 'Anos de dedicação culminam neste grande brinde. Nossa entrega garante uma operação robusta, elegante e rápida, pronta para atender o ritmo intenso de uma formatura inesquecível. Para o dia ',
      sufixoData: d => ` (o momento perfeito para coroar essa conquista), preparei uma proposta sob medida para `,
      corpo: ' convidados, garantindo padrão internacional de coquetelaria em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' especialistas focados em alta rotação e excelência no atendimento.',
      textoBalcao: 'Estrutura moderna e imponente, projetada para destacar o ambiente de grande celebração.'
    },
    corporativo: {
      tituloSecao: 'Proposta: Evento Corporativo de Elite',
      abertura: 'Eventos corporativos de sucesso exigem precisão, discrição e sofisticação para elevar a autoridade da sua marca perante clientes e parceiros. Para o dia ',
      sufixoData: d => ` (${d}), desenvolvi uma proposta estratégica para `,
      corpo: ' convidados, unindo eficiência operacional e padrão executivo em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' profissionais altamente treinados para entregar uma experiência impecável e discreta.',
      textoBalcao: 'Bar com design executivo, elegante e limpo, perfeitamente integrado ao ambiente corporativo.',
      adjetivoEquipe: 'discreto e refinado'
    },
    outros: {
      tituloSecao: 'Proposta: Experiência Exclusiva',
      abertura: 'Cada celebração tem sua própria essência. Desenvolvemos uma operação de bar personalizada para garantir que o seu evento seja lembrado pela excelência e pelo sabor único. Para o dia ',
      sufixoData: d => ` (${d}), preparei uma proposta exclusiva para `,
      corpo: ' convidados, focada em entregar o mais alto padrão em Goiânia. Recomendo uma equipe com ',
      fechamentoIntro: ' profissionais dedicados a superar as expectativas de cada convidado.',
      textoBalcao: 'Estrutura versátil, elegante e totalmente adaptável ao conceito do seu evento.'
    }
  };

  const setForm = (vals) => ['tipo-evento', 'endereco', 'data', 'convidados', 'bartenders', 'backbar', 'horas', 'valor', 'observacoes']
    .forEach(k => $(`pr-${k}`).value = vals[k] || '');

  const formatarEquipe = (bartenders, backbar) => {
    const partes = [`${bartenders} bartender${bartenders > 1 ? 's' : ''}`];
    if (backbar > 0) partes.push(`${backbar} backbar${backbar > 1 ? 's' : ''}`);
    return partes.join(' e ');
  };

  const getForm = () => ({
    tipo: val('pr-tipo-evento'), endereco: val('pr-endereco'), data: val('pr-data'),
    convidados: val('pr-convidados'), bartenders: val('pr-bartenders'),
    backbar: val('pr-backbar'), horas: val('pr-horas'),
    total: parseFloat(val('pr-valor')) || 0, observacoes: val('pr-observacoes')
  });

  const abrirNovaProposta = () => {
    setForm({ 'tipo-evento': 'casamento' });
    state.idEmEdicao = null;
    $('proposta-form-titulo').textContent = 'Fazer Proposta';
    $('proposta-form-subtitulo').textContent = 'Preencha os dados do evento para gerar o texto da proposta.';
    goToScreen('screen-criar-proposta');
  };

  const abrirEdicaoProposta = () => {
    const proposta = PropostasRepository.getAll().find(p => p.id === state.detalheId);
    if (!proposta) return;

    setForm({
      'tipo-evento': proposta.tipo, endereco: proposta.endereco, data: proposta.data,
      convidados: proposta.convidados, bartenders: proposta.bartenders, backbar: proposta.backbar,
      horas: proposta.horas, valor: proposta.total, observacoes: proposta.observacoes
    });
    state.idEmEdicao = proposta.id;
    $('proposta-form-titulo').textContent = 'Editar Proposta';
    $('proposta-form-subtitulo').textContent = 'Atualize os dados do evento para gerar novamente o texto da proposta.';
    goToScreen('screen-criar-proposta');
  };

  const getTemplate = (tipo, { dataExtenso, diaSemana, convidados, equipeTexto, horas }) => {
    const c = CONFIG[tipo] || CONFIG.casamento;
    return {
      introSegmentos: [
        { text: c.abertura }, { text: dataExtenso, bold: true }, { text: c.sufixoData(diaSemana) },
        { text: String(convidados), bold: true }, { text: c.corpo }, { text: equipeTexto, bold: true }, { text: c.fechamentoIntro }
      ],
      tituloSecao: c.tituloSecao,
      cards: [
        { titulo: 'Cardápio Misto Premium', itens: c.cardapio || CARDAPIO_PADRAO },
        { titulo: 'Estrutura e Serviço', itens: [
          { lead: 'Bar e Estrutura:', texto: c.textoBalcao },
          { lead: 'Vidraria e Acabamento:', texto: 'Copos e taças de vidro específicos para cada tipo de coquetel, elevando a experiência sensorial.' },
          { lead: 'Equipe de Alta Performance:', texto: `${equipeTexto}, treinados para atendimento ágil, ${c.adjetivoEquipe || 'carismático'} e visual impecável.` },
          { lead: 'Tempo de Serviço:', texto: `${horas} horas de bar aberto contínuo, sem interrupções e com reposição imediata.` }
        ]}
      ],
      fechamento: 'Trabalhamos com uma estrutura totalmente modular e móvel, garantindo pontualidade e adaptação perfeita em qualquer espaço de Goiânia e região metropolitana.',
      fechamentoComEndereco: 'Com o local já definido, nossa equipe técnica cuidará de todo o alinhamento logístico para que você não precise se preocupar com absolutamente nada no dia.'
    };
  };

  async function gerarProposta() {
    const d = getForm();
    if (!d.data || !d.convidados || !d.bartenders || !d.horas || !d.total) {
      return alert('Preencha todos os campos obrigatórios.');
    }

    const bartenders = Number(d.bartenders) || 0;
    const backbar = Number(d.backbar) || 0;
    const dataExtenso = formatarDataExtenso(d.data);
    const equipeTexto = formatarEquipe(bartenders, backbar);
    const tpl = getTemplate(d.tipo, { ...d, bartenders, backbar, dataExtenso, diaSemana: diaDaSemanaExtenso(d.data), equipeTexto });
    const fechamentoReal = d.endereco ? tpl.fechamentoComEndereco : tpl.fechamento;

    const formasPagamento = [
      { lead: `30% de Sinal (R$ ${formatarMoeda(d.total * 0.3)}):`, texto: 'Garante a reserva exclusiva da sua data no calendário e a emissão do contrato.' },
      { lead: `70% Restantes (R$ ${formatarMoeda(d.total * 0.7)}):`, texto: 'Flexibilidade de parcelamento com quitação até 3 dias antes do evento.' }
    ];

    const texto = [
      d.endereco ? `Endereço do cliente: ${d.endereco}\n` : '',
      tpl.introSegmentos.map(s => s.text).join(''),
      `\n🥂 ${tpl.tituloSecao.toUpperCase()}`,
      ...tpl.cards.flatMap(c => [`\n${c.titulo.toUpperCase()}`, ...c.itens.map(i => `• ${i.lead} ${i.texto}`)]),
      `\nINVESTIMENTO TOTAL: R$ ${formatarMoeda(d.total)} (PIX, cartão ou TED)\n\nFORMAS DE PAGAMENTO`,
      ...formasPagamento.map(i => `• ${i.lead} ${i.texto}`),
      `\n${fechamentoReal}`
    ].join('\n');

    const dadosProposta = { ...d, bartenders, backbar, template: tpl, formasPagamento, fechamentoReal, texto };

    let proposta;
    if (state.idEmEdicao !== null) {
      await PropostasRepository.update(state.idEmEdicao, dadosProposta);
      proposta = PropostasRepository.getAll().find(p => p.id === state.idEmEdicao);
      state.idEmEdicao = null;
    } else {
      proposta = await PropostasRepository.add({ dataHora: new Date().toISOString(), ...dadosProposta });
    }

    if (!proposta) return alert('Não foi possível salvar a proposta. Tente novamente.');

    renderLista();
    abrirDetalheSalva(proposta);
  }

  function abrirDetalheSalva(proposta) {
    state.detalheId = proposta.id;
    $('proposta-detalhe-tipo').textContent = TIPOS_EVENTO[proposta.tipo];
    $('proposta-detalhe-resumo').textContent = `${proposta.convidados} convidados • ${formatarMoeda(proposta.total)} • ${formatarDataExtenso(proposta.data)}`;
    $('proposta-detalhe-texto').value = proposta.texto;
    goToScreen('screen-proposta-detalhe');
  }

  function badgeData(dataISO) {
    const data = parseDataLocal(dataISO);
    if (!data) return { dia: '--', mes: '' };
    return { dia: String(data.getDate()).padStart(2, '0'), mes: NOMES_MES[data.getMonth()].slice(0, 3) };
  }

  function cardPropostaHTML(proposta) {
    const { dia, mes } = badgeData(proposta.data);
    return `
      <div class="evento-card" data-id="${proposta.id}">
        <div class="evento-data-badge">
          <span class="dia">${dia}</span>
          <span class="mes">${mes}</span>
        </div>
        <div class="evento-card-corpo">
          <div class="evento-cliente">${TIPOS_EVENTO[proposta.tipo] || 'Proposta'}</div>
          <div class="evento-info">${proposta.endereco || 'Local não informado'}</div>
          <div class="evento-contagem">${proposta.convidados || 0} convidados • ${formatarMoeda(proposta.total)}</div>
        </div>
        <div class="evento-card-acoes">
          <button type="button" class="btn-excluir-proposta" data-admin-only data-id="${proposta.id}">Excluir</button>
        </div>
      </div>`;
  }

  function renderLista() {
    const container = $('propostas-list');
    if (!container) return;

    const propostas = PropostasRepository.getAll()
      .slice()
      .sort((a, b) => b.dataHora.localeCompare(a.dataHora));

    container.innerHTML = propostas.length
      ? propostas.map(cardPropostaHTML).join('')
      : `<p class="empty-state">Nenhuma proposta criada ainda.</p>`;
  }

  async function aoClicarNaLista(event) {
    const botaoExcluir = event.target.closest('.btn-excluir-proposta');
    if (botaoExcluir) {
      event.stopPropagation();
      await confirmarEExcluir(
        'Excluir esta proposta? Essa ação não pode ser desfeita.',
        () => PropostasRepository.remove(Number(botaoExcluir.dataset.id))
      );
      return;
    }

    const card = event.target.closest('.evento-card');
    if (!card) return;
    const proposta = PropostasRepository.getAll().find(p => p.id === Number(card.dataset.id));
    if (proposta) abrirDetalheSalva(proposta);
  }

  const nomeArquivoPDF = (p) => `proposta-${p.tipo}-${p.id}.pdf`;

  // Chama a Edge Function "gerar-proposta-pdf", que monta o PDF no servidor
  // (mesmo layout de antes), salva no bucket "propostas-pdfs" do Storage
  // e devolve os bytes do PDF já prontos para baixar/compartilhar.
  async function gerarPDFViaFuncao(p) {
    const { data, error } = await supabase.functions.invoke('gerar-proposta-pdf', {
      body: { proposta: p },
    });

    if (error) {
      alert('Não foi possível gerar o PDF. Tente novamente.');
      return null;
    }

    // supabase-js devolve Blob quando a resposta não é JSON.
    return data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  }

  const baixarBlobPDF = (blob, nomeArquivo) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function baixarPDF() {
    const p = PropostasRepository.getAll().find(x => x.id === state.detalheId);
    if (!p) return;

    const blob = await gerarPDFViaFuncao(p);
    if (!blob) return;
    baixarBlobPDF(blob, nomeArquivoPDF(p));
  }

  // Compartilha o PDF da proposta pelo menu nativo do dispositivo (Web Share API).
  // Se o dispositivo/navegador não suportar compartilhamento de arquivos, baixa o PDF como alternativa.
  async function compartilharPDF() {
    const p = PropostasRepository.getAll().find(x => x.id === state.detalheId);
    if (!p) return;

    const blob = await gerarPDFViaFuncao(p);
    if (!blob) return;

    const arquivo = new File([blob], nomeArquivoPDF(p), { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: 'Proposta ON Coquetelaria' });
      } catch (erro) {
        if (erro.name !== 'AbortError') alert('Não foi possível compartilhar. Tente baixar o PDF.');
      }
      return;
    }

    alert('Compartilhamento direto não é suportado neste navegador. Baixando o PDF para você compartilhar manualmente.');
    baixarBlobPDF(blob, nomeArquivoPDF(p));
  }

  async function init() {
    $('pr-tipo-evento').innerHTML = Object.entries(TIPOS_EVENTO).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    document.querySelectorAll('[data-action="nova-proposta"]').forEach(el => el.addEventListener('click', abrirNovaProposta));
    $('proposta-form-btn-salvar').addEventListener('click', gerarProposta);
    $('btn-editar-proposta').addEventListener('click', abrirEdicaoProposta);
    $('btn-baixar-pdf').addEventListener('click', baixarPDF);
    $('btn-compartilhar-proposta').addEventListener('click', compartilharPDF);
    $('btn-copiar-proposta').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(val('proposta-detalhe-texto')); alert('Copiado!'); }
      catch { alert('Selecione manualmente.'); }
    });

    $('propostas-list').addEventListener('click', aoClicarNaLista);
    PropostasRepository.assinar(renderLista);
    await PropostasRepository.init();
  }

  return { init, getAll: () => PropostasRepository.getAll() };
})();
