export const formatarMoeda = valor =>
  (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const NOMES_MES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export const NOMES_DIA_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'
];

export function parseDataLocal(dataISO) {
  if (!dataISO) return null;
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export const formatarData = dataISO =>
  dataISO ? new Date(`${dataISO}T00:00:00`).toLocaleDateString('pt-BR') : '';

export const formatarHorario = (inicio, fim) => [inicio, fim].filter(Boolean).join(' às ');

export const formatarDataExtenso = dataISO => {
  const data = parseDataLocal(dataISO);
  if (!data) return '';
  return `${data.getDate()} de ${NOMES_MES[data.getMonth()]} de ${data.getFullYear()}`;
};

export const diaDaSemanaExtenso = dataISO => {
  const data = parseDataLocal(dataISO);
  return data ? NOMES_DIA_SEMANA[data.getDay()] : '';
};

// Retorna quantos dias faltam para a data (negativo se já passou, 0 se é hoje)
export function diferencaEmDias(dataISO) {
  const data = parseDataLocal(dataISO);
  if (!data) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  data.setHours(0, 0, 0, 0);

  const MS_POR_DIA = 1000 * 60 * 60 * 24;
  return Math.round((data - hoje) / MS_POR_DIA);
}

// Formata um número decimal cortando zeros desnecessários (ex: 3.00 -> "3", 1.5 -> "1.5")
export function formatarQuantidade(valor) {
  const arredondado = Math.round((valor + Number.EPSILON) * 100) / 100;
  return arredondado % 1 === 0 ? String(arredondado) : String(arredondado.toFixed(2)).replace(/0+$/, '');
}