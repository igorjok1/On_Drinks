import { isAdmin } from './auth.js';
import { pedirConfirmacao } from '../components/confirmacao.js';

/**
 * Fluxo repetido em toda tela que tem botão de excluir (drinks, eventos,
 * gastos do financeiro, propostas): checar se é admin, pedir confirmação
 * e só então excluir. Antes cada módulo reimplementava esses 3 passos —
 * agora fica num único lugar (DRY), e essa função vira a única fonte de
 * verdade sobre "como uma exclusão acontece" no app (SRP).
 *
 * O checkAdmin aqui é intencional mesmo com o botão já escondido via CSS
 * pra quem não é admin: é a segunda camada de segurança, não a única.
 *
 * Retorna true se a exclusão foi confirmada e executada, false caso
 * contrário (sem permissão ou usuário cancelou).
 */
export async function confirmarEExcluir(mensagem, acaoExcluir) {
  if (!isAdmin()) return false;

  const confirmado = await pedirConfirmacao(mensagem);
  if (!confirmado) return false;

  const sucesso = await acaoExcluir();
  if (!sucesso) {
    alert('Não foi possível excluir. Verifique sua conexão ou permissão e tente novamente.');
    return false;
  }

  return true;
}