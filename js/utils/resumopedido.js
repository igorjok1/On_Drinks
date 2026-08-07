import { formatarData, formatarHorario, formatarMoeda } from './formatters.js';

// Única fonte de verdade para transformar um pedido nos pares label/valor
// exibidos tanto na Agenda (eventos.js) quanto na Lista de Compras (listaCompras.js).
// Qualquer novo campo do pedido que deva aparecer nessas telas entra aqui uma única vez.
export function montarResumoPedido(evento) {
  const linhas = [
    { label: 'Cliente', valor: evento.cliente },
    { label: 'Data', valor: formatarData(evento.dataEvento) },
    { label: 'Horário', valor: formatarHorario(evento.horaInicio, evento.horaFim) },
    { label: 'Endereço', valor: evento.endereco },
    { label: 'Convidados', valor: evento.convidados ? `${evento.convidados}` : '' },
    { label: 'Bartenders', valor: evento.bartenders ? `${evento.bartenders}` : '' },
    { label: 'Backbar', valor: evento.backbar ? `${evento.backbar}` : '' },
    { label: 'Valor do contrato', valor: evento.valorContrato ? formatarMoeda(evento.valorContrato) : '' },
    { label: 'Valor de entrada', valor: evento.valorEntrada ? formatarMoeda(evento.valorEntrada) : '' }
  ];

  return linhas.filter(l => l.valor);
}
