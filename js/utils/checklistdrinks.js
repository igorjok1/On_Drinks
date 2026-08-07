import { Drinks } from '../modules/drinks.js';
import { $ } from '../utils/dom.js';
import { filtrarPorTexto, criarControladorBusca } from '../utils/busca.js';

export function criarChecklistDeDrinks({ searchInputId, listContainerId, selecionados }) {
  const busca = criarControladorBusca(searchInputId, () => render());

  function render() {
    const container = $(listContainerId);

    const drinks = filtrarPorTexto(Drinks.getAll(), busca.obterTermo(), d => d.nome)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    container.innerHTML = drinks.length
      ? drinks.map(d => `
          <label class="pedido-drink-item">
            <input type="checkbox" class="pedido-drink-checkbox" value="${d.id}" ${selecionados.has(d.id) ? 'checked' : ''}>
            <span class="drink-item-photo drink-item-icon" style="${d.foto ? `background-image:url('${d.foto}')` : ''}">
              ${d.foto ? '' : '🍸'}
            </span>
            <span class="drink-item-name">${d.nome}</span>
          </label>`).join('')
      : `<p class="empty-state">Cadastre drinks primeiro para poder selecioná-los.</p>`;
  }

  function toggle(event) {
    if (!event.target.classList.contains('pedido-drink-checkbox')) return;
    const id = Number(event.target.value);
    event.target.checked ? selecionados.add(id) : selecionados.delete(id);
  }

  function init() {
    busca.init();
    $(listContainerId).addEventListener('change', toggle);
    render();
  }

  return { init, render };
}
