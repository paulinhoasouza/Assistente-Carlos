import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

interface ErroDb {
  code?: string;
  message: string;
}

const num = (v: unknown): number => Number(v);
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Garante ponto final na mensagem, como em memory.ts. */
function comPonto(msg: string): string {
  const m = msg.trim();
  return /[.!?]$/.test(m) ? m : `${m}.`;
}

/** Escapa curingas do LIKE (% _ \). */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Converte erro do banco: regra (P0001) e check (23514) viram ErroUsuario; o resto vira Error. */
function lancar(error: ErroDb): never {
  if (error.code === "P0001") throw new ErroUsuario(comPonto(error.message));
  if (error.code === "23514") {
    throw new ErroUsuario("Valor inválido: confira preço, custo e estoque (não podem ser negativos).");
  }
  throw new Error(`Erro no banco de dados: ${error.message}`);
}

function paraItem(r: Record<string, unknown>): Item {
  return {
    id: num(r.id),
    codigo: String(r.codigo),
    nome: String(r.nome),
    unidade: String(r.unidade),
    preco: num(r.preco),
    custo: numOuNull(r.custo),
    estoque: num(r.estoque),
    estoque_minimo: num(r.estoque_minimo),
  };
}

function paraCliente(r: Record<string, unknown>): Cliente {
  return {
    id: num(r.id),
    nome: String(r.nome),
    telefone: (r.telefone as string | null) ?? null,
    obs: (r.obs as string | null) ?? null,
  };
}

/** Dia civil (YYYY-MM-DD) em America/Sao_Paulo. */
function diaBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Início e fim (exclusivo) do dia civil em São Paulo; offset fixo -03:00 (sem horário de verão desde 2019). */
function limitesDoDia(data: Date): { inicio: string; fim: string } {
  const dia = diaBR(data);
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const prox = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  return { inicio: `${dia}T00:00:00-03:00`, fim: `${prox}T00:00:00-03:00` };
}

export class RepositorioSupabase implements Repositorio {
  constructor(private readonly db: SupabaseClient) {}

  async criarItem(novo: NovoItem): Promise<Item> {
    const codigo = novo.codigo.trim().toUpperCase();
    if (!codigo) throw new ErroUsuario("Informe o código do item.");
    const { data, error } = await this.db
      .from("itens")
      .insert({
        codigo,
        nome: novo.nome,
        unidade: novo.unidade,
        preco: novo.preco,
        custo: novo.custo,
        estoque: novo.estoque_inicial,
        estoque_minimo: novo.estoque_minimo,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new ErroUsuario(`Já existe um item com o código ${codigo}.`);
      }
      lancar(error);
    }
    const item = paraItem(data as Record<string, unknown>);
    if (novo.estoque_inicial > 0) {
      const { error: errMov } = await this.db.from("movimentos_estoque").insert({
        item_id: item.id,
        tipo: "entrada",
        quantidade: novo.estoque_inicial,
        estoque_apos: item.estoque,
        motivo: "estoque inicial",
      });
      if (errMov) lancar(errMov);
    }
    return item;
  }

  async listarItens(busca?: string): Promise<Item[]> {
    let q = this.db.from("itens").select("*").eq("ativo", true);
    const b = busca?.trim();
    if (b) {
      const padrao = `%${escaparLike(b)}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      q = q.or(`nome.ilike."${padrao}",codigo.ilike."${padrao}"`);
    }
    const { data, error } = await q.order("nome");
    if (error) lancar(error);
    return ((data ?? []) as Record<string, unknown>[]).map(paraItem);
  }

  async buscarItemPorCodigo(codigo: string): Promise<Item | null> {
    const { data, error } = await this.db
      .from("itens")
      .select("*")
      .eq("codigo", codigo.trim().toUpperCase())
      .maybeSingle();
    if (error) lancar(error);
    return data ? paraItem(data as Record<string, unknown>) : null;
  }

  private async itemAposRpc(codigo: string): Promise<Item> {
    const item = await this.buscarItemPorCodigo(codigo);
    if (!item) throw new ErroUsuario(`Item ${codigo.trim().toUpperCase()} não encontrado.`);
    return item;
  }

  async registrarEntrada(codigo: string, quantidade: number, motivo?: string): Promise<Item> {
    const { error } = await this.db.rpc("registrar_entrada", {
      p_codigo: codigo,
      p_quantidade: quantidade,
      p_motivo: motivo ?? null,
    });
    if (error) lancar(error);
    return this.itemAposRpc(codigo);
  }

  async ajustarEstoque(codigo: string, novoEstoque: number, motivo?: string): Promise<Item> {
    const { error } = await this.db.rpc("ajustar_estoque", {
      p_codigo: codigo,
      p_novo_estoque: novoEstoque,
      p_motivo: motivo ?? null,
    });
    if (error) lancar(error);
    return this.itemAposRpc(codigo);
  }

  async itensEstoqueBaixo(): Promise<Item[]> {
    // supabase-js não compara duas colunas: filtra no código.
    const { data, error } = await this.db.from("itens").select("*").eq("ativo", true).order("nome");
    if (error) lancar(error);
    return ((data ?? []) as Record<string, unknown>[])
      .map(paraItem)
      .filter((i) => i.estoque <= i.estoque_minimo);
  }

  async criarCliente(novo: NovoCliente): Promise<Cliente> {
    const nome = novo.nome.trim();
    if (!nome) throw new ErroUsuario("Informe o nome do cliente.");
    const { data, error } = await this.db
      .from("clientes")
      .insert({ nome, telefone: novo.telefone, obs: novo.obs })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new ErroUsuario(`Já existe um cliente chamado ${nome}.`);
      }
      lancar(error);
    }
    return paraCliente(data as Record<string, unknown>);
  }

  async listarClientes(busca?: string): Promise<Cliente[]> {
    let q = this.db.from("clientes").select("*");
    const b = busca?.trim();
    if (b) q = q.ilike("nome", `%${escaparLike(b)}%`);
    const { data, error } = await q.order("nome");
    if (error) lancar(error);
    return ((data ?? []) as Record<string, unknown>[]).map(paraCliente);
  }

  async buscarClientePorNome(nome: string): Promise<Cliente | null> {
    const { data, error } = await this.db
      .from("clientes")
      .select("*")
      .ilike("nome", escaparLike(nome.trim()))
      .limit(1)
      .maybeSingle();
    if (error) lancar(error);
    return data ? paraCliente(data as Record<string, unknown>) : null;
  }

  async registrarVenda(
    clienteId: number | null,
    forma: FormaPagamento,
    itens: VendaItemEntrada[],
  ): Promise<ResultadoVenda> {
    const { data, error } = await this.db.rpc("registrar_venda", {
      p_cliente_id: clienteId,
      p_forma: forma,
      p_itens: itens.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade })),
    });
    if (error) lancar(error);
    const r = data as Record<string, unknown>;
    const resItens = ((r.itens ?? []) as Record<string, unknown>[]).map(
      (i): ResultadoVendaItem => ({
        codigo: String(i.codigo),
        nome: String(i.nome),
        quantidade: num(i.quantidade),
        preco_unitario: num(i.preco_unitario),
        subtotal: num(i.subtotal),
        estoque_apos: num(i.estoque_apos),
      }),
    );
    const alertas = ((r.alertas ?? []) as Record<string, unknown>[]).map(
      (a): AlertaEstoque => ({
        codigo: String(a.codigo),
        nome: String(a.nome),
        estoque: num(a.estoque),
        estoque_minimo: num(a.estoque_minimo),
      }),
    );
    return { venda_id: num(r.venda_id), total: num(r.total), itens: resItens, alertas };
  }

  async vendasDoDia(data: Date): Promise<ResumoVenda[]> {
    const { inicio, fim } = limitesDoDia(data);
    const { data: linhas, error } = await this.db
      .from("vendas")
      .select("id, criado_em, forma_pagamento, total, clientes(nome)")
      .gte("criado_em", inicio)
      .lt("criado_em", fim)
      .order("criado_em");
    if (error) lancar(error);
    return ((linhas ?? []) as Record<string, unknown>[]).map((v) => {
      const cli = v.clientes as { nome?: string } | { nome?: string }[] | null | undefined;
      const nome = Array.isArray(cli) ? cli[0]?.nome : cli?.nome;
      return {
        id: num(v.id),
        criado_em: new Date(String(v.criado_em)),
        cliente_nome: nome ?? null,
        forma_pagamento: v.forma_pagamento as FormaPagamento,
        total: num(v.total),
      };
    });
  }
}

export function criarRepositorioSupabase(url: string, serviceRoleKey: string): RepositorioSupabase {
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return new RepositorioSupabase(client);
}
