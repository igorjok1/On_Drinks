import { goToScreen } from '../utils/navigation.js';
import { criarRepositorioSupabase } from '../utils/repository.js';
import { enviarArquivo } from '../utils/uploads.js';
import { filtrarPorTexto, criarControladorBusca } from '../utils/busca.js';
import { confirmarEExcluir } from '../utils/exclusao.js';
import { criarSeletorDeArquivo } from '../utils/seletorDeArquivo.js';
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
            <button type="button" class="btn-excluir-drink" data-admin-only data-id="${d.id}">Excluir</button>
          </div>`).join('')
      : `<p class="empty-state">Nenhum drink cadastrado ainda.</p>`;
  }

  async function aoClicarLista(event) {
    const botao = event.target.closest('.btn-excluir-drink');
    if (!botao) return;

    const id = Number(botao.dataset.id);
    const drink = DrinksRepository.getAll().find(d => d.id === id);
    if (!drink) return;

    await confirmarEExcluir(
      `Excluir o drink "${drink.nome}"? Essa ação não pode ser desfeita.`,
      () => DrinksRepository.remove(id)
    );
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

// ---------- UI: Tela "Adicionar Drink" (formulário + insumos dinâmicos) ----------
const AddDrinkScreen = (() => {
  const foto = criarSeletorDeArquivo({ previewId: 'drink-photo-preview', inputId: 'drink-photo-input' });
  let insumoSeq = 0;

  function criarLinhaInsumo() {
    insumoSeq += 1;
    const row = document.createElement('div');
    row.className = 'insumo-row';
    row.dataset.insumoRow = insumoSeq;
    row.innerHTML = `
      <input type="text" class="form-input insumo-nome" placeholder="Insumo (ex: Limão)">
      <input type="number" class="form-input insumo-qtd" placeholder="Qtd" min="0" step="0.01">
      <input type="text" class="form-input insumo-unidade" placeholder="Unidade (ex: un, kg, ml)">
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

  function resetForm() {
    $('drink-name-input').value = '';
    $('drink-desc-input').value = '';
    $('insumos-container').innerHTML = '';
    foto.reset();
    criarLinhaInsumo();
  }

  async function salvar() {
    const nome = $('drink-name-input').value.trim();
    if (!nome) {
      alert('Informe o nome do drink.');
      return;
    }

    const botaoSalvar = $('btn-save-drink');
    botaoSalvar.disabled = true;

    // A foto sobe pro Storage do Supabase (não fica mais em base64 salvo
    // no banco) — só a URL pública final é que é gravada no drink.
    const arquivoFoto = foto.obterArquivo();
    const urlFoto = arquivoFoto ? await enviarArquivo(BUCKET_FOTOS, arquivoFoto) : '';

    await DrinksRepository.add({
      nome,
      descricao: $('drink-desc-input').value.trim(),
      foto: urlFoto,
      insumos: lerInsumos()
    });

    botaoSalvar.disabled = false;
    resetForm();
    goToScreen('screen-drinks');
  }

  function init() {
    foto.init();
    $('btn-add-insumo').addEventListener('click', criarLinhaInsumo);
    $('btn-save-drink').addEventListener('click', salvar);
    resetForm();
  }

  return { init, resetForm };
})();

async function init() {
  DrinksListScreen.init();
  AddDrinkScreen.init();
  DrinksRepository.assinar(DrinksListScreen.render);
  await DrinksRepository.init();
}

Drinks.init = init;
