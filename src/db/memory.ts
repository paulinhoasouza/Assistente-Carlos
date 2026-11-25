import { ErroUsuario } from "../core/erros.js";
import type {
  AlertaEstoque,
  Cliente,
  FormaPagamento,
  Item,
  NovoCliente,
  NovoItem,
  ResultadoVenda,
  ResultadoVendaItem,
  ResumoVenda,
  VendaItemEntrada,
} from "../core/tipos.js";
import type { Repositorio } from "./repo.js";

const FORMAS: FormaPagamento[] = ["dinheiro", "pix", "cartao", "fiado"];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Dia civil no fuso do Brasil (YYYY-MM-DD). */
function diaBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

interface VendaGuardada {
  id: number;
  criado_em: Date;
  cliente_id: number | null;
  forma_pagamento: FormaPagamento;
  total: number;
}

export class RepositorioMemoria implements Repositorio {
  private itens: Item[] = [];
  private clientes: Cliente[] = [];
  private vendas: VendaGuardada[] = [];
  private seqItem = 0;
  private seqCliente = 0;
  private seqVenda = 0;

  constructor(private readonly relogio: () => Date = () => new Date()) {}

  private achar(codigo: string): Item {
    const cod = codigo.trim().toUpperCase();
    const item = this.itens.find((i) => i.codigo === cod);
    if (!item) throw new ErroUsuario(`Item ${cod} não encontrado.`);
    return item;
  }

  async criarItem(novo: NovoItem): Promise<Item> {
    const codigo = novo.codigo.trim().toUpperCase();
    if (!codigo) throw new ErroUsuario("Informe o código do item.");
    if (this.itens.some((i) => i.codigo === codigo)) {
      throw new ErroUsuario(`Já existe um item com o código ${codigo}.`);
    }
    if (novo.preco < 0 || (novo.custo !== null && novo.custo < 0)) {
      throw new ErroUsuario("Preço e custo não podem ser negativos.");
    }
    if (novo.estoque_inicial < 0 || novo.estoque_minimo < 0) {
      throw new ErroUsuario("Estoque não pode ser negativo.");
    }
    const item: Item = {
      id: ++this.seqItem,
      codigo,
      nome: novo.nome,
      unidade: novo.unidade,
      preco: round2(novo.preco),
      custo: novo.custo === null ? null : round2(novo.custo),
      estoque: novo.estoque_inicial,
      estoque_minimo: novo.estoque_minimo,
    };
    this.itens.push(item);
    return { ...item };
  }

  async listarItens(busca?: string): Promise<Item[]> {
    const b = busca?.trim().toLowerCase();
    return this.itens
      .filter((i) => !b || i.codigo.toLowerCase().includes(b) || i.nome.toLowerCase().includes(b))
      .sort((a, c) => a.codigo.localeCompare(c.codigo))
      .map((i) => ({ ...i }));
  }

  async buscarItemPorCodigo(codigo: string): Promise<Item | null> {
    const cod = codigo.trim().toUpperCase();
    const i = this.itens.find((x) => x.codigo === cod);
    return i ? { ...i } : null;
  }

  async registrarEntrada(codigo: string, quantidade: number, _motivo?: string): Promise<Item> {
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new ErroUsuario("Quantidade deve ser maior que zero.");
    }
    const item = this.achar(codigo);
    item.estoque += quantidade;
    return { ...item };
  }

  async ajustarEstoque(codigo: string, novoEstoque: number, _motivo?: string): Promise<Item> {
    if (!Number.isInteger(novoEstoque) || novoEstoque < 0) {
      throw new ErroUsuario("Novo estoque não pode ser negativo.");
    }
    const item = this.achar(codigo);
    item.estoque = novoEstoque;
    return { ...item };
  }

  async itensEstoqueBaixo(): Promise<Item[]> {
    return this.itens
      .filter((i) => i.estoque <= i.estoque_minimo)
      .sort((a, c) => a.codigo.localeCompare(c.codigo))
      .map((i) => ({ ...i }));
  }

  async criarCliente(novo: NovoCliente): Promise<Cliente> {
    const nome = novo.nome.trim();
    if (!nome) throw new ErroUsuario("Informe o nome do cliente.");
    if (this.clientes.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      throw new ErroUsuario(`Já existe um cliente chamado ${nome}.`);
    }
    const c: Cliente = { id: ++this.seqCliente, nome, telefone: novo.telefone, obs: novo.obs };
    this.clientes.push(c);
    return { ...c };
  }

  async listarClientes(busca?: string): Promise<Cliente[]> {
    const b = busca?.trim().toLowerCase();
    return this.clientes
      .filter((c) => !b || c.nome.toLowerCase().includes(b))
      .sort((a, c) => a.nome.localeCompare(c.nome))
      .map((c) => ({ ...c }));
  }

  async buscarClientePorNome(nome: string): Promise<Cliente | null> {
    const n = nome.trim().toLowerCase();
    const c = this.clientes.find((x) => x.nome.toLowerCase() === n);
    return c ? { ...c } : null;
  }

  async registrarVenda(
    clienteId: number | null,
    forma: FormaPagamento,
    itens: VendaItemEntrada[],
  ): Promise<ResultadoVenda> {
    if (!FORMAS.includes(forma)) {
      throw new ErroUsuario(`Forma de pagamento inválida: ${forma ?? "(vazia)"}`);
    }
    if (forma === "fiado" && clienteId === null) {
      throw new ErroUsuario("Venda fiado exige cliente.");
    }
    if (clienteId !== null && !this.clientes.some((c) => c.id === clienteId)) {
      throw new ErroUsuario("Cliente não encontrado.");
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      throw new ErroUsuario("A venda precisa ter ao menos um item.");
    }
    if (
      itens.some(
        (e) => !e.codigo?.trim() || !Number.isInteger(e.quantidade) || e.quantidade <= 0,
      )
    ) {
      throw new ErroUsuario("Itens inválidos: informe código e quantidade maior que zero.");
    }

    // soma códigos repetidos
    const somados = new Map<string, number>();
    for (const e of itens) {
      const cod = e.codigo.trim().toUpperCase();
      somados.set(cod, (somados.get(cod) ?? 0) + e.quantidade);
    }

    // itens inexistentes (primeiro em ordem alfabética, como o SQL)
    const faltando = [...somados.keys()]
      .sort()
      .find((cod) => !this.itens.some((i) => i.codigo === cod));
    if (faltando) throw new ErroUsuario(`Item ${faltando} não encontrado.`);

    // valida tudo antes de mexer em qualquer estoque (tudo-ou-nada), em ordem de id
    const linhas = [...somados.entries()]
      .map(([cod, qtd]) => ({ item: this.achar(cod), qtd }))
      .sort((a, b) => a.item.id - b.item.id);
    for (const { item, qtd } of linhas) {
      if (item.estoque < qtd) {
        throw new ErroUsuario(
          `Estoque insuficiente para ${item.codigo}: disponível ${item.estoque}, pedido ${qtd}.`,
        );
      }
    }

    const resItens: ResultadoVendaItem[] = [];
    const alertas: AlertaEstoque[] = [];
    let total = 0;
    for (const { item, qtd } of linhas) {
      const subtotal = round2(item.preco * qtd);
      total = round2(total + subtotal);
      item.estoque -= qtd;
      resItens.push({
        codigo: item.codigo,
        nome: item.nome,
        quantidade: qtd,
        preco_unitario: item.preco,
        subtotal,
        estoque_apos: item.estoque,
      });
      if (item.estoque <= item.estoque_minimo) {
        alertas.push({
          codigo: item.codigo,
          nome: item.nome,
          estoque: item.estoque,
          estoque_minimo: item.estoque_minimo,
        });
      }
    }

    const venda: VendaGuardada = {
      id: ++this.seqVenda,
      criado_em: this.relogio(),
      cliente_id: clienteId,
      forma_pagamento: forma,
      total,
    };
    this.vendas.push(venda);
    return { venda_id: venda.id, total, itens: resItens, alertas };
  }

  async vendasDoDia(data: Date): Promise<ResumoVenda[]> {
    const dia = diaBR(data);
    return this.vendas
      .filter((v) => diaBR(v.criado_em) === dia)
      .map((v) => ({
        id: v.id,
        criado_em: v.criado_em,
        cliente_nome: this.clientes.find((c) => c.id === v.cliente_id)?.nome ?? null,
        forma_pagamento: v.forma_pagamento,
        total: v.total,
      }));
  }
}
