import { supabase } from './supabaseClient.js';

/**
 * Repositório genérico para tabelas do Supabase que guardam registros
 * "por evento" (ex.: itens extras da lista de compras, ajustes de
 * quantidade). Diferente de repository.js — que mantém a tabela inteira
 * em cache — aqui cada consulta já vem filtrada por evento_id, então não
 * faz sentido cachear tudo em memória; getAll() é assíncrono de propósito.
 *
 * Extrai o padrão "buscar/inserir/escutar por evento_id" que já existia
 * (e continuaria se repetindo) em listaCompras.js, para que novos
 * repositórios desse tipo não precisem reescrevê-lo (DRY).
 *
 * Requisito das tabelas no Supabase: colunas id (identity) e evento_id
 * (referenciando eventos.id), além das colunas específicas de cada uma.
 */
export function criarRepositorioPorEvento(tabela) {
  let canalRealtime = null;

  return {
    async getAll(eventoId) {
      const { data, error } = await supabase
        .from(tabela)
        .select('*')
        .eq('evento_id', eventoId)
        .order('id', { ascending: true });

      if (error) {
        console.error(`[${tabela}] erro ao carregar:`, error.message);
        return [];
      }
      return data;
    },

    async add(registro) {
      const { data, error } = await supabase.from(tabela).insert(registro).select().single();
      if (error) {
        console.error(`[${tabela}] erro ao adicionar:`, error.message);
        return null;
      }
      return data;
    },

    async update(id, camposParciais) {
      const { data, error } = await supabase
        .from(tabela)
        .update(camposParciais)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error(`[${tabela}] erro ao atualizar:`, error.message);
        return null;
      }
      return data;
    },

    /** Insere ou atualiza com base numa coluna (ou combinação) com
     *  restrição UNIQUE, ex.: 'evento_id,chave'. */
    async upsert(registro, colunasConflito) {
      const { data, error } = await supabase
        .from(tabela)
        .upsert(registro, { onConflict: colunasConflito })
        .select()
        .single();

      if (error) {
        console.error(`[${tabela}] erro ao salvar:`, error.message);
        return null;
      }
      return data;
    },

    async remove(id) {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      if (error) console.error(`[${tabela}] erro ao excluir:`, error.message);
      return !error;
    },

    // Um canal por evento (o filtro evita ficar recebendo mudanças de
    // outros pedidos). Reabrir a tela troca o canal pro evento novo.
    assinar(eventoId, callback) {
      if (canalRealtime) supabase.removeChannel(canalRealtime);

      canalRealtime = supabase
        .channel(`realtime:${tabela}:${eventoId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tabela, filter: `evento_id=eq.${eventoId}` },
          callback
        )
        .subscribe();
    }
  };
}
