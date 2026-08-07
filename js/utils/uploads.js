import { supabase } from './supabaseClient.js';

/**
 * Envia um arquivo (File) para um bucket do Supabase Storage e devolve a
 * URL pública dele. Único lugar do app que sabe como subir um arquivo —
 * drinks.js e financeiro.js só chamam isso, sem conhecer a API do Storage.
 */
export async function enviarArquivo(bucket, arquivo) {
  if (!arquivo) return '';

  const nomeUnico = `${Date.now()}-${arquivo.name}`.replace(/\s+/g, '-');

  const { error } = await supabase.storage.from(bucket).upload(nomeUnico, arquivo, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) {
    console.error(`Erro ao enviar arquivo para "${bucket}":`, error.message);
    return '';
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(nomeUnico);
  return data.publicUrl;
}
