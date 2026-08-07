import { supabase } from './supabaseClient.js';
import { getUsuarioAtual } from './auth.js';

/**
 * Cria um repositório de "lista de itens com id" apoiado no Supabase.
 * É o sucessor direto do antigo criarListaPersistida() (storage.js), com a
 * mesma ideia — getAll()/add()/update() — mas guardando os dados na nuvem
 * em vez do localStorage, e acrescentando remove() (restrito a admins pela
 * política de RLS da tabela, então continua seguro mesmo se alguém burlar
 * o front-end).
 *
 * getAll() continua síncrono de propósito: o repositório mantém uma cópia
 * em memória (cache), carregada no init() e mantida em dia por realtime —
 * assim nenhum módulo consumidor (checklistDrinks, listaCompras, etc.)
 * precisa virar assíncrono só porque a origem do dado mudou.
 *
 * Requisito da tabela no Supabase: colunas id (identity), dados (jsonb).
 */
export function criarRepositorioSupabase(tabela) {
  let items = [];
  const ouvintes = new Set();

  const linhaParaItem = linha => ({ id: linha.id, ...linha.dados });
  const notificar = () => ouvintes.forEach(callback => callback(items));

  async function carregar() {
    const { data, error } = await supabase
      .from(tabela)
      .select('id, dados')
      .order('id', { ascending: true });

    if (error) {
      console.error(`[${tabela}] erro ao carregar:`, error.message);
      items = [];
    } else {
      items = data.map(linhaParaItem);
    }
    notificar();
  }

  function assinarRealtime() {
    supabase
      .channel(`realtime:${tabela}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, carregar)
      .subscribe();
  }

  return {
    /** Carrega os dados iniciais e liga o realtime. Chame uma vez, no início. */
    async init() {
      await carregar();
      assinarRealtime();
    },

    getAll: () => items,

    /** Inscreve um ouvinte que roda toda vez que a lista mudar (localmente
     *  ou por realtime). Retorna uma função para cancelar a inscrição. */
    assinar(callback) {
      ouvintes.add(callback);
      return () => ouvintes.delete(callback);
    },

    async add(item) {
      const { id: _ignorarIdLocal, ...dados } = item;
      const { data, error } = await supabase
        .from(tabela)
        .insert({ dados, criado_por: getUsuarioAtual()?.id })
        .select('id, dados')
        .single();

      if (error) {
        console.error(`[${tabela}] erro ao adicionar:`, error.message);
        return null;
      }

      const novoItem = linhaParaItem(data);
      items.push(novoItem);
      notificar();
      return novoItem;
    },

    async update(id, dadosParciais) {
      const atual = items.find(item => item.id === id);
      if (!atual) return false;

      const { id: _ignorarId, ...dadosMesclados } = { ...atual, ...dadosParciais };

      const { data, error } = await supabase
        .from(tabela)
        .update({ dados: dadosMesclados })
        .eq('id', id)
        .select('id, dados')
        .single();

      if (error) {
        console.error(`[${tabela}] erro ao atualizar:`, error.message);
        return false;
      }

      const indice = items.findIndex(item => item.id === id);
      if (indice !== -1) items[indice] = linhaParaItem(data);
      notificar();
      return true;
    },

    /** Exclui em definitivo. A política de RLS da tabela garante que só
     *  admins conseguem — usuários comuns recebem erro do Supabase aqui. */
    async remove(id) {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      if (error) {
        console.error(`[${tabela}] erro ao excluir:`, error.message);
        return false;
      }

      items = items.filter(item => item.id !== id);
      notificar();
      return true;
    }
  };
}
