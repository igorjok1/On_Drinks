import { EventBus } from '../utils/eventBus.js';
import { goToScreen } from '../utils/navigation.js';
import { criarChecklistDeDrinks } from '../components/checklistDrinks.js';
import { $ } from '../utils/dom.js';

export const Pedidos = (() => {
  // Campos de texto/número simples do formulário (drinks e id de edição são tratados à parte).
  const CAMPOS_FORM = ['pedido-cliente-input', 'pedido-data-input', 'pedido-hora-inicio-input', 'pedido-hora-fim-input',
    'pedido-convidados-input', 'pedido-endereco-input', 'pedido-valor-contrato-input',
    'pedido-valor-entrada-input', 'pedido-bartenders-input', 'pedido-backbar-input'];

  const state = { drinksSelecionados: new Set(), idEmEdicao: null };

  const checklistDrinks = criarChecklistDeDrinks({
    searchInputId: 'pedido-drink-search',
    listContainerId: 'pedido-drinks-list',
    selecionados: state.drinksSelecionados
  });

  function atualizarCabecalho(emEdicao) {
    $('pedido-form-titulo').textContent = emEdicao ? 'Editar Pedido' : 'Criar Pedido';
    $('pedido-form-subtitulo').textContent = emEdicao
      ? 'Atualize os dados do pedido e os drinks selecionados.'
      : 'Informe o número de convidados e marque os drinks do evento.';
    $('btn-save-pedido').textContent = emEdicao ? 'Salvar Alterações' : 'Criar Pedido';
  }

  function resetForm() {
    CAMPOS_FORM.forEach(id => $(id).value = '');
    $('pedido-drink-search').value = '';
    state.drinksSelecionados.clear();
    state.idEmEdicao = null;
    atualizarCabecalho(false);
    checklistDrinks.render();
  }

  // Preenche o formulário com os dados de um pedido já existente, entrando em modo de edição.
  function preencherForm(pedido) {
    $('pedido-cliente-input').value = pedido.cliente || '';
    $('pedido-data-input').value = pedido.dataEvento || '';
    $('pedido-hora-inicio-input').value = pedido.horaInicio || '';
    $('pedido-hora-fim-input').value = pedido.horaFim || '';
    $('pedido-convidados-input').value = pedido.convidados || '';
    $('pedido-endereco-input').value = pedido.endereco || '';
    $('pedido-valor-contrato-input').value = pedido.valorContrato || '';
    $('pedido-valor-entrada-input').value = pedido.valorEntrada || '';
    $('pedido-bartenders-input').value = pedido.bartenders || '';
    $('pedido-backbar-input').value = pedido.backbar || '';

    state.drinksSelecionados.clear();
    (pedido.drinksSelecionados || []).forEach(id => state.drinksSelecionados.add(id));
    checklistDrinks.render();

    state.idEmEdicao = pedido.id;
    atualizarCabecalho(true);
  }

  function lerFormulario() {
    return {
      cliente: $('pedido-cliente-input').value.trim(),
      dataEvento: $('pedido-data-input').value,
      horaInicio: $('pedido-hora-inicio-input').value,
      horaFim: $('pedido-hora-fim-input').value,
      convidados: Number($('pedido-convidados-input').value) || 0,
      endereco: $('pedido-endereco-input').value.trim(),
      valorContrato: Number($('pedido-valor-contrato-input').value) || 0,
      valorEntrada: Number($('pedido-valor-entrada-input').value) || 0,
      // Backbar é opcional: sem valor informado, assume 0 (nenhum backbar no pedido).
      bartenders: Number($('pedido-bartenders-input').value) || 0,
      backbar: Number($('pedido-backbar-input').value) || 0,
      drinksSelecionados: Array.from(state.drinksSelecionados)
    };
  }

  function save() {
    const dados = lerFormulario();
    if (!dados.cliente) {
      alert('Informe o nome do cliente.');
      return;
    }

    const emEdicao = state.idEmEdicao !== null;
    const pedido = { id: emEdicao ? state.idEmEdicao : Date.now(), ...dados };
    EventBus.emit(emEdicao ? 'pedido:atualizado' : 'pedido:criado', pedido);

    resetForm();
    goToScreen('screen-home');
  }

  function init() {
    checklistDrinks.init();
    document.getElementById('btn-save-pedido').addEventListener('click', save);
    document.querySelectorAll('[data-action="novo-pedido"]').forEach(el => el.addEventListener('click', resetForm));

    EventBus.on('pedido:editar', pedido => {
      preencherForm(pedido);
      goToScreen('screen-criar-pedido');
    });
  }

  return { init };
})();