/**
 * Encapsula o padrão "clicar numa prévia -> escolher um arquivo -> mostrar
 * uma pré-visualização instantânea com FileReader -> guardar o File para
 * subir depois", usado tanto na foto do drink (drinks.js) quanto no
 * comprovante de gasto (financeiro.js). As duas telas tinham essa mesma
 * lógica copiada com nomes diferentes; agora ela mora num único lugar
 * (DRY) e cada tela só cuida do que é específico dela — nome, descrição
 * etc. (SRP).
 *
 * Uso:
 *   const foto = criarSeletorDeArquivo({ previewId: 'drink-photo-preview', inputId: 'drink-photo-input' });
 *   foto.init();            // liga os listeners de clique/seleção
 *   foto.obterArquivo();    // File escolhido, ou null
 *   foto.reset();           // limpa a prévia e o File guardado
 */
export function criarSeletorDeArquivo({ previewId, inputId }) {
  let arquivo = null;

  function elementoPreview() {
    return document.getElementById(previewId);
  }

  function elementoInput() {
    return document.getElementById(inputId);
  }

  function mostrarPreview(urlDados) {
    const preview = elementoPreview();
    if (!preview) return;
    preview.style.backgroundImage = `url('${urlDados}')`;
    preview.classList.add('has-photo');
  }

  function aoSelecionarArquivo(event) {
    const selecionado = event.target.files[0];
    if (!selecionado) return;

    arquivo = selecionado;
    const leitor = new FileReader();
    leitor.onload = () => mostrarPreview(leitor.result); // só pré-visualização, o upload de verdade acontece em enviarArquivo()
    leitor.readAsDataURL(selecionado);
  }

  function init() {
    const preview = elementoPreview();
    const input = elementoInput();
    if (!preview || !input) return;

    preview.addEventListener('click', () => input.click());
    input.addEventListener('change', aoSelecionarArquivo);
  }

  function reset() {
    const preview = elementoPreview();
    if (preview) {
      preview.style.backgroundImage = '';
      preview.classList.remove('has-photo');
    }

    const input = elementoInput();
    if (input) input.value = '';

    arquivo = null;
  }

  return {
    init,
    reset,
    obterArquivo: () => arquivo
  };
}
