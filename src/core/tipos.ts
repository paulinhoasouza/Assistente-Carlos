export type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado";

export interface Item {
  id: number;
  codigo: string;
  nome: string;
  unidade: string;
  preco: number;
  custo: number | null;
  estoque: number;
  estoque_minimo: number;
}

export interface NovoItem {
  codigo: string;
  nome: string;
  preco: number;
  custo: number | null;
  unidade: string;
  estoque_minimo: number;
  estoque_inicial: number;
}

export interface Cliente {
  id: number;
  nome: string;
  telefone: string | null;
  obs: string | null;
}

export interface NovoCliente {
  nome: string;
  telefone: string | null;
  obs: string | null;
}

export interface VendaItemEntrada {
  codigo: string;
  quantidade: number;
}

export interface ResultadoVendaItem {
  codigo: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  estoque_apos: number;
}

export interface AlertaEstoque {
  codigo: string;
  nome: string;
  estoque: number;
  estoque_minimo: number;
}

/** Espelha o jsonb retornado por registrar_venda no SQL. */
export interface ResultadoVenda {
  venda_id: number;
  total: number;
  itens: ResultadoVendaItem[];
  alertas: AlertaEstoque[];
}

export interface ResumoVenda {
  id: number;
  criado_em: Date;
  cliente_nome: string | null;
  forma_pagamento: FormaPagamento;
  total: number;
}
