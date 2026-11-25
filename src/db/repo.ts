import type {
  Cliente,
  FormaPagamento,
  Item,
  NovoCliente,
  NovoItem,
  ResultadoVenda,
  ResumoVenda,
  VendaItemEntrada,
} from "../core/tipos.js";

/** Erros de regra lançam ErroUsuario (estoque insuficiente, item/cliente duplicado ou inexistente, fiado sem cliente...). */
export interface Repositorio {
  criarItem(novo: NovoItem): Promise<Item>;
  listarItens(busca?: string): Promise<Item[]>;
  buscarItemPorCodigo(codigo: string): Promise<Item | null>;
  registrarEntrada(codigo: string, quantidade: number, motivo?: string): Promise<Item>;
  ajustarEstoque(codigo: string, novoEstoque: number, motivo?: string): Promise<Item>;
  itensEstoqueBaixo(): Promise<Item[]>;
  criarCliente(novo: NovoCliente): Promise<Cliente>;
  listarClientes(busca?: string): Promise<Cliente[]>;
  buscarClientePorNome(nome: string): Promise<Cliente | null>;
  registrarVenda(
    clienteId: number | null,
    forma: FormaPagamento,
    itens: VendaItemEntrada[],
  ): Promise<ResultadoVenda>;
  vendasDoDia(data: Date): Promise<ResumoVenda[]>;
}
