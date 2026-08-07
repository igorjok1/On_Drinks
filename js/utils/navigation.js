export function goToScreen(telaId) {
  document.querySelectorAll('.screen').forEach(tela => tela.classList.remove('active'));
  const telaDestino = document.getElementById(telaId);
  if (telaDestino) telaDestino.classList.add('active');

  document.querySelectorAll('.tabbar .tab').forEach(aba => {
    aba.classList.toggle('active', aba.getAttribute('data-target') === telaId);
  });

  window.scrollTo(0, 0);
}

export function initNavigation() {
  document.querySelectorAll('[data-target]').forEach(botao => {
    botao.addEventListener('click', () => goToScreen(botao.getAttribute('data-target')));
  });
}