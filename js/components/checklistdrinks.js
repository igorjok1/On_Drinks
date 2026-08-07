import { Drinks } from '../modules/drinks.js';

export function criarChecklistDeDrinks({ searchInputId, listContainerId, selecionados }) {
  function render() {
    const termo = document.getElementById(searchInputId).value.trim().toLowerCase();
    const container = document.getElementById(listContainerId);

    const drinks = Drinks.getAll()
      .filter(d => d.nome.toLowerCase().includes(termo))
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
    document.getElementById(searchInputId).addEventListener('input', render);
    document.getElementById(listContainerId).addEventListener('change', toggle);
    render();
  }

  return { init, render };
}