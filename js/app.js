import { initNavigation } from './utils/navigation.js';
import { entrar, sair, restaurarSessao, getUsuarioAtual, isAdmin } from './utils/auth.js';
import { Drinks } from './modules/drinks.js';
import { Pedidos } from './modules/pedidos.js';
import { Propostas } from './modules/propostas.js';
import { Financeiro } from './modules/financeiro.js';
import { Eventos } from './modules/eventos.js';
import { ListaCompras } from './modules/listaCompras.js';

const $ = id => document.getElementById(id);
let appJaIniciado = false;

/**
 * Inicializa todos os módulos, na ordem certa: Eventos precisa estar
 * pronto antes do Financeiro, já que ambos compartilham o mesmo
 * repositório de pedidos (ver eventos.js).
 */
async function iniciarApp() {
  if (appJaIniciado) return;
  appJaIniciado = true;

  const usuario = getUsuarioAtual();
  document.body.classList.add('autenticado');
  document.body.classList.toggle('is-admin', isAdmin());
  $('usuario-logado-nome').textContent = usuario.nome;

  initNavigation();

  await Eventos.init();
  await Drinks.init();
  await Financeiro.init();
  await Propostas.init();
  await ListaCompras.init();
  Pedidos.init();
}

function mostrarErroLogin(mensagem) {
  $('login-erro').textContent = mensagem;
}

async function aoSubmeterLogin(event) {
  event.preventDefault();

  const usuario = $('login-usuario').value.trim();
  const senha = $('login-senha').value;
  const botao = $('login-botao');

  botao.disabled = true;
  botao.textContent = 'Entrando...';

  const resultado = await entrar(usuario, senha);

  botao.disabled = false;
  botao.textContent = 'Entrar';

  if (!resultado.ok) {
    mostrarErroLogin(resultado.mensagem);
    return;
  }

  mostrarErroLogin('');
  await iniciarApp();
}

async function aoClicarSair() {
  await sair();
  location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
  $('login-form').addEventListener('submit', aoSubmeterLogin);
  $('btn-logout').addEventListener('click', aoClicarSair);

  const usuario = await restaurarSessao();
  if (usuario) {
    await iniciarApp();
    return;
  }
});
