const SELETORES = {
  overlay: 'modal-editar-quantidade',
  mensagem: 'modal-editar-quantidade-mensagem',
  input: 'modal-editar-quantidade-input',
  botaoOk: 'modal-editar-quantidade-ok',
  botaoCancelar: 'modal-editar-quantidade-cancelar'
};

/**
 * Pede um valor numérico ao usuário usando o modal do app (mesmo padrão de
 * components/confirmacao.js, só que em vez de OK/Cancelar sobre uma
 * mensagem, o modal tem um campo numérico). Retorna uma Promise<number|null>:
 * o número informado se confirmado, null se cancelado.
 *
 * Uso:
 *   const novaQtd = await pedirValorNumerico('Nova quantidade para "Gelo"', 10);
 *   if (novaQtd !== null) { ...salvar novaQtd... }
 */
export function pedirValorNumerico(mensagem, valorAtual) {
  const overlay = document.getElementById(SELETORES.overlay);
  const input = document.getElementById(SELETORES.input);
  const botaoOk = document.getElementById(SELETORES.botaoOk);
  const botaoCancelar = document.getElementById(SELETORES.botaoCancelar);

  document.getElementById(SELETORES.mensagem).textContent = mensagem;
  input.value = valorAtual ?? '';

  return new Promise(resolve => {
    function finalizar(resultado) {
      overlay.hidden = true;
      botaoOk.removeEventListener('click', aoConfirmar);
      botaoCancelar.removeEventListener('click', aoCancelar);
      resolve(resultado);
    }

    function aoConfirmar() {
      const valor = Number(input.value);
      if (Number.isNaN(valor) || valor < 0) {
        input.focus();
        return;
      }
      finalizar(valor);
    }

    function aoCancelar() { finalizar(null); }

    botaoOk.addEventListener('click', aoConfirmar);
    botaoCancelar.addEventListener('click', aoCancelar);
    overlay.hidden = false;
    input.focus();
  });
}
