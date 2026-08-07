import { supabase } from './supabaseClient.js';
import { EventBus } from './eventBus.js';

let usuarioAtual = null; // { id, email, nome, admin }

async function carregarPerfil(userAuth) {
  const { data, error } = await supabase
    .from('perfis')
    .select('nome, admin')
    .eq('id', userAuth.id)
    .single();

  if (error) {
    console.error('Erro ao carregar perfil do usuário:', error.message);
    return { id: userAuth.id, email: userAuth.email, nome: userAuth.email, admin: false };
  }

  return { id: userAuth.id, email: userAuth.email, nome: data.nome, admin: data.admin };
}

export function getUsuarioAtual() {
  return usuarioAtual;
}

export function isAdmin() {
  return Boolean(usuarioAtual?.admin);
}

/**
 * Autentica com e-mail + senha reais. Retorna { ok, usuario } ou { ok: false, mensagem }.
 */
export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha
  });

  if (error) {
    return { ok: false, mensagem: error.message }; // Mostra o erro real do Supabase para facilitar
  }

  usuarioAtual = await carregarPerfil(data.user);
  EventBus.emit('auth:entrou', usuarioAtual);
  return { ok: true, usuario: usuarioAtual };
}

export async function sair() {
  await supabase.auth.signOut();
  usuarioAtual = null;
  EventBus.emit('auth:saiu');
}

/**
 * Tenta reaproveitar uma sessão já existente.
 */
export async function restaurarSessao() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  usuarioAtual = await carregarPerfil(data.session.user);
  return usuarioAtual;
}