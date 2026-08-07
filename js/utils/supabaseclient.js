import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Preencha com os dados do seu projeto (Dashboard → Project Settings → API).
// A "anon key" é pública por natureza — quem protege os dados de verdade
// são as políticas de RLS definidas em supabase/schema.sql, não o segredo
// desta chave.
const SUPABASE_URL = 'https://xavoxmerthxzvjvkywzv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_idauyMK_fsKLAj9HKUCGkQ_NwZ1Bxu5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
