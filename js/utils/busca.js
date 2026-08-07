/**
 * Utilitário genérico de busca por texto.
 *
 * Centraliza aqui a lógica de "normalizar + filtrar" e o padrão de UI
 * "input -> filtra -> renderiza", usados em várias telas do app (Drinks,
 * Eventos, Financeiro). Isso evita reescrever a mesma lógica em cada
 * módulo (DRY) e mantém cada peça com uma única responsabilidade (SRP).
 */

function normalizar(texto) {
  return (texto || '').toString().toLowerCase().trim();
}

/**
 * Filtra uma lista comparando o termo de busca com o texto extraído de
 * cada item. `extrairTexto` isola "o que buscar" de "como buscar", então
 * a mesma função serve para buscar drinks pelo nome, eventos pelo
 * cliente, etc.
 */
export function filtrarPorTexto(itens, termo, extrairTexto) {
  const termoNormalizado = normalizar(termo);
  if (!termoNormalizado) return itens;
  return itens.filter(item => normalizar(extrairTexto(item)).includes(termoNormalizado));
}

/**
 * Cria um controlador de busca reaproveitável: guarda o termo atual e
 * dispara `aoBuscar` sempre que o usuário digita no campo `inputId`.
 * Encapsula a ligação com o DOM, então as telas só precisam chamar
 * `init()` e usar `obterTermo()` na hora de renderizar.
 */
export function criarControladorBusca(inputId, aoBuscar) {
  let termo = '';

  function init() {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => {
      termo = input.value;
      aoBuscar(termo);
    });
  }

  return {
    init,
    obterTermo: () => termo
  };
}
