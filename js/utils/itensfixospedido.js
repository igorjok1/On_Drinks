// Itens que entram automaticamente em toda Lista de Compras, independente
// dos drinks selecionados no pedido. Alterar a lista de itens é só editar
// os arrays abaixo — nenhuma outra parte do código precisa mudar.

const UNIDADE_PADRAO = 'un';

// Itens de quantidade fixa por evento (não variam com convidados nem bartenders).
const CAIXA_RESERVA = [
  'Enfeites',
  'Copo descartável',
  'Guardanapo',
  'Canudos',
  'Sucos tang reservas',
  'Luvas',
  'Saco de lixo',
  'Porta guardanapo',
  'Gravatinha e suspensório',
  'Display',
  'Cápsulas (Espumas)',
  'Sal (cajá lemon)'
];

// Utensílios do bartender: quantidade calculada "por bartender".
// A maioria é 1 por bartender; os que fogem da regra têm seu próprio multiplicador.
const MULTIPLICADOR_PADRAO_POR_BARTENDER = 1;

const UTENSILIOS_BARTENDER = [
  { nome: 'Garrafas', porBartender: 4 },
  { nome: 'Tábua de corte', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Açúcar', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Tapete de borracha', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Porta guardanapos', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Coqueteleira', porBartender: 2 },
  { nome: 'Faca', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Colher normal', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Macerador', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Pegador', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Bailarina', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Pá de gelo', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Funil', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Espremedor de limão', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Dosador', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Biqueira', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER },
  { nome: 'Bandeja / bucha / sabão', porBartender: MULTIPLICADOR_PADRAO_POR_BARTENDER }
];

export function itensCaixaReserva() {
  return CAIXA_RESERVA.map(nome => ({ nome, quantidade: 1, unidade: UNIDADE_PADRAO }));
}

export function itensUtensiliosBartender(quantidadeBartenders) {
  const bartenders = quantidadeBartenders || 0;
  return UTENSILIOS_BARTENDER.map(({ nome, porBartender }) => ({
    nome,
    quantidade: porBartender * bartenders,
    unidade: UNIDADE_PADRAO
  }));
}
