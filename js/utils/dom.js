/**
 * Atalho para document.getElementById, usado em praticamente todo módulo
 * de UI do app. Antes cada arquivo (listaCompras.js, pedidos.js,
 * propostas.js, app.js...) redefinia a mesma função `$` localmente — um
 * caso clássico de duplicação (viola DRY) por não existir um lugar único
 * para algo tão básico. Centralizado aqui, um único import substitui
 * todas essas cópias.
 */
export const $ = id => document.getElementById(id);
