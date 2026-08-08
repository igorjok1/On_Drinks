import { goToScreen } from '../utils/navigation.js';
import { criarRepositorioSupabase } from '../utils/repository.js';
import { enviarArquivo } from '../utils/uploads.js';
import { filtrarPorTexto, criarControladorBusca } from '../utils/busca.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { criarSeletorDeArquivo } from '../utils/seletorDeArquivo.js';
import { isAdmin } from '../utils/auth.js';
import { $ } from '../utils/dom.js';

const BUCKET_FOTOS = 'drinks-fotos';

// ---------- Repositório ----------
const DrinksRepository = criarRepositorioSupabase('drinks');

// Exportado para o checklistDrinks.js (e qualquer outro consumidor futuro)
export const Drinks = {
  getAll: DrinksRepository.getAll,
  getNomes: ids => (ids || [])
    .map(id => DrinksRepository.getAll().find(d => d.id === id)?.nome)
    .filter(Boolean)
};

// ---------- UI: Tela "Drinks & Insumos" (listagem + busca) ----------
const DrinksListScreen = (() => {
  const busca = criarControladorBusca('drink-search', () => render());

  function render() {
    const container = $('drink-list');

    const drinks = filtrarPorTexto(DrinksRepository.getAll(), busca.obterTermo(), d => d.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    container.innerHTML = drinks.length
      ? drinks.map(d => `
          <div class="drink-item" data-id="${d.id}">
            <div class="drink-item-photo" style="${d.foto ? `background-image:url('${d.foto}')` : ''}"></div>
            <div>
              <div class="drink-item-name">${d.nome}</div>
              <div class="drink-item-desc">${d.descricao ? d.descricao.slice(0, 60) : 'Sem descrição'}</div>
            </div>
            <span class="drink-item-editar-hint" data-admin-only aria-hidden="true" title="Toque para editar">✎</span>
            <button type="button" class="btn-excluir-drink" data-admin-only data-id="${d.id}">Excluir</button>
          </div>`).join('')
      : `<p class="empty-state">Nenhum drink cadastrado ainda.</p>`;
  }

  async function aoClicarExcluir(botao) {
    const id = Number(botao.dataset.id);
    const drink = DrinksRepository.getAll().find(d => d.id === id);
    if (!drink) return;

    await confirmarEExcluir(
      `Excluir o drink "${drink.nome}"? Essa ação não pode ser desfeita.`,
      () => DrinksRepository.remove(id)
    );
  }

  // Admin: tocar em qualquer parte do card (fora do botão de excluir) abre
  // o formulário de edição, já preenchido com os dados do drink — inclusive
  // os insumos usados pela lista de compras. Não-admin: não faz nada, a
  // RLS da tabela já bloquearia a escrita mesmo se o clique passasse.
  function aoClicarEditar(item) {
    if (!isAdmin()) return;

    const id = Number(item.dataset.id);
    const drink = DrinksRepository.getAll().find(d => d.id === id);
    if (!drink) return;

    AddDrinkScreen.preencherForm(drink);
    goToScreen('screen-add-drink');
  }

  function aoClicarLista(event) {
    const botaoExcluir = event.target.closest('.btn-excluir-drink');
    if (botaoExcluir) return aoClicarExcluir(botaoExcluir);

    const item = event.target.closest('.drink-item');
    if (item) aoClicarEditar(item);
  }

  function init() {
    busca.init();
    $('drink-list').addEventListener('click', aoClicarLista);
    $('btn-add-drink').addEventListener('click', () => {
      AddDrinkScreen.resetForm();
      goToScreen('screen-add-drink');
    });
  }

  return { init, render };
})();

// ---------- UI: Tela "Adicionar/Editar Drink" (formulário + insumos dinâmicos) ----------
const AddDrinkScreen = (() => {
  const foto = criarSeletorDeArquivo({ previewId: 'drink-photo-preview', inputId: 'drink-photo-input' });
  const state = { idEmEdicao: null, fotoAtualUrl: '' };
  let insumoSeq = 0;

  function criarLinhaInsumo(inicial = {}) {
    insumoSeq += 1;
    const row = document.createElement('div');
    row.className = 'insumo-row';
    row.dataset.insumoRow = insumoSeq;
    row.innerHTML = `
      <input type="text" class="form-input insumo-nome" placeholder="Insumo (ex: Limão)" value="${inicial.nome || ''}">
      <input type="number" class="form-input insumo-qtd" placeholder="Qtd" min="0" step="0.01" value="${inicial.quantidade != null ? inicial.quantidade : ''}">
      <input type="text" class="form-input insumo-unidade" placeholder="Unidade (ex: un, kg, ml)" value="${inicial.unidade || ''}">
      <button type="button" class="insumo-remove">×</button>
    `;
    row.querySelector('.insumo-remove').addEventListener('click', () => row.remove());
    $('insumos-container').appendChild(row);
  }

  function lerInsumos() {
    return Array.from(document.querySelectorAll('#insumos-container .insumo-row'))
      .map(row => ({
        nome: row.querySelector('.insumo-nome').value.trim(),
        quantidade: Number(row.querySelector('.insumo-qtd').value) || 0,
        unidade: row.querySelector('.insumo-unidade').value.trim()
      }))
      .filter(i => i.nome);
  }

  function atualizarCabecalho(emEdicao) {
    $('drink-form-eyebrow').textContent = emEdicao ? '— Editar Drink' : '— Novo Drink';
    $('drink-form-titulo').textContent = emEdicao ? 'Editar Drink' : 'Adicionar Drink';
    $('btn-save-drink').textContent = emEdicao ? 'Salvar alterações' : 'Salvar drink';
  }

  function resetForm() {
    $('drink-name-input').value = '';
    $('drink-desc-input').value = '';
    $('insumos-container').innerHTML = '';
    foto.reset();
    criarLinhaInsumo();

    state.idEmEdicao = null;
    state.fotoAtualUrl = '';
    atualizarCabecalho(false);
  }

  // Preenche o formulário com os dados de um drink já existente, entrando
  // em modo de edição (mesmo padrão de Pedidos.preencherForm em pedidos.js).
  function preencherForm(drink) {
    $('drink-name-input').value = drink.nome || '';
    $('drink-desc-input').value = drink.descricao || '';

    $('insumos-container').innerHTML = '';
    const insumos = drink.insumos && drink.insumos.length ? drink.insumos : [{}];
    insumos.forEach(insumo => criarLinhaInsumo(insumo));

    foto.reset();
    state.fotoAtualUrl = drink.foto || '';
    if (state.fotoAtualUrl) {
      const preview = $('drink-photo-preview');
      preview.style.backgroundImage = `url('${state.fotoAtualUrl}')`;
      preview.classList.add('has-photo');
    }

    state.idEmEdicao = drink.id;
    atualizarCabecalho(true);
  }

  async function salvar() {
    const nome = $('drink-name-input').value.trim();
    if (!nome) {
      alert('Informe o nome do drink.');
      return;
    }

    const botaoSalvar = $('btn-save-drink');
    botaoSalvar.disabled = true;

    // A foto só sobe pro Storage se uma nova foi escolhida; se não, mantém
    // a URL já salva (relevante ao editar um drink sem trocar a foto).
    const arquivoFoto = foto.obterArquivo();
    const urlFoto = arquivoFoto ? await enviarArquivo(BUCKET_FOTOS, arquivoFoto) : state.fotoAtualUrl;

    const dados = {
      nome,
      descricao: $('drink-desc-input').value.trim(),
      foto: urlFoto,
      insumos: lerInsumos()
    };

    if (state.idEmEdicao !== null) {
      await DrinksRepository.update(state.idEmEdicao, dados);
    } else {
      await DrinksRepository.add(dados);
    }

    botaoSalvar.disabled = false;
    resetForm();
    goToScreen('screen-drinks');
  }

  function init() {
    foto.init();
    $('btn-add-insumo').addEventListener('click', () => criarLinhaInsumo());
    $('btn-save-drink').addEventListener('click', salvar);
    $('btn-cancel-drink').addEventListener('click', resetForm);
    resetForm();
  }

  return { init, resetForm, preencherForm };
})();

async function init() {
  DrinksListScreen.init();
  AddDrinkScreen.init();
  DrinksRepository.assinar(DrinksListScreen.render);
  await DrinksRepository.init();
}

Drinks.init = init;
