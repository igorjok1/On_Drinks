const SELETORES = {
  overlay: 'modal-confirmacao',
  mensagem: 'modal-confirmacao-mensagem',
  botaoOk: 'modal-confirmacao-ok',
  botaoCancelar: 'modal-confirmacao-cancelar'
};

/**
 * Pede confirmação ao usuário antes de uma ação, usando o modal do app
 * (em vez do confirm() nativo do navegador, que foge do visual do app).
 * Retorna uma Promise<boolean>: true se confirmado, false se cancelado.
 *
 * Uso: const confirmado = await pedirConfirmacao('Marcar "Gelo" como separado?');
 */
export function pedirConfirmacao(mensagem) {
  const overlay = document.getElementById(SELETORES.overlay);
  const botaoOk = document.getElementById(SELETORES.botaoOk);
  const botaoCancelar = document.getElementById(SELETORES.botaoCancelar);

  document.getElementById(SELETORES.mensagem).textContent = mensagem;

  return new Promise(resolve => {
    function finalizar(resultado) {
      overlay.hidden = true;
      botaoOk.removeEventListener('click', aoConfirmar);
      botaoCancelar.removeEventListener('click', aoCancelar);
      resolve(resultado);
    }

    function aoConfirmar() { finalizar(true); }
    function aoCancelar() { finalizar(false); }

    botaoOk.addEventListener('click', aoConfirmar);
    botaoCancelar.addEventListener('click', aoCancelar);
    overlay.hidden = false;
  });
}
