import { ErroUsuario } from "./erros.js";
import {
  parseAjuste,
  parseClienteNovo,
  parseEntrada,
  parseItemNovo,
  parseVenda,
} from "./parse.js";
import type { AlertaEstoque, FormaPagamento, Item } from "./tipos.js";
import type { Repositorio } from "../db/repo.js";

export function formatarReais(valor: number): string {
  const [inteiro, dec] = valor.toFixed(2).split(".");
  return `R$ ${inteiro!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

const NOME_FORMA: Record<FormaPagamento, string> = {
  dinheiro: "dinheiro",
  pix: "pix",
  cartao: "cartão",
  fiado: "fiado",
};

function linhaAlerta(a: AlertaEstoque): string {
  return `⚠️ ${a.codigo} (${a.nome}): estoque ${a.estoque}, mínimo ${a.estoque_minimo}`;
}

function linhaItem(i: Item): string {
  const aviso = i.estoque <= i.estoque_minimo ? " ⚠️" : "";
  return `• ${i.codigo} — ${i.nome} | ${formatarReais(i.preco)} | estoque: ${i.estoque} ${i.unidade}${aviso}`;
}

export class Servicos {
  constructor(private readonly repo: Repositorio) {}

  async ajuda(): Promise<string> {
    return [
      "📋 Comandos disponíveis:",
      "",
      "/item_novo codigo | nome | preco [| custo | unidade | minimo | estoque_inicial]",
      "/itens [busca]",
      "/entrada codigo | quantidade [| motivo]",
      "/ajuste codigo | novo_estoque [| motivo]",
      "/estoque_baixo",
      "/cliente_novo nome [| telefone | obs]",
      "/clientes [busca]",
      "/venda cliente | pagamento | COD xQTD, COD xQTD",
      "/vendas_hoje",
      "",
      "Exemplo: /venda Maria Silva | pix | CAM01 x2, BON01 x1",
      "Sem cliente: use - no lugar do nome. Pagamento: dinheiro, pix, cartao ou fiado.",
    ].join("\n");
  }

  async itemNovo(args: string): Promise<string> {
    const item = await this.repo.criarItem(parseItemNovo(args));
    return `✅ Item cadastrado:\n${linhaItem(item)}`;
  }

  async itens(args: string): Promise<string> {
    const busca = args.trim() || undefined;
    const lista = await this.repo.listarItens(busca);
    if (lista.length === 0) {
      return busca
        ? `📦 Nenhum item encontrado para "${busca}".`
        : "📦 Nenhum item cadastrado ainda. Use /item_novo para cadastrar.";
    }
    return `📦 Itens (${lista.length}):\n${lista.map(linhaItem).join("\n")}`;
  }

  async entrada(args: string): Promise<string> {
    const { codigo, quantidade, motivo } = parseEntrada(args);
    const item = await this.repo.registrarEntrada(codigo, quantidade, motivo);
    return (
      `✅ Entrada registrada: +${quantidade} ${item.unidade} de ${item.codigo} (${item.nome}).\n` +
      `Estoque atual: ${item.estoque}` +
      this.avisoMinimo(item)
    );
  }

  async ajuste(args: string): Promise<string> {
    const { codigo, novoEstoque, motivo } = parseAjuste(args);
    const item = await this.repo.ajustarEstoque(codigo, novoEstoque, motivo);
    return (
      `✅ Estoque ajustado: ${item.codigo} (${item.nome}) agora tem ${item.estoque} ${item.unidade}.` +
      this.avisoMinimo(item)
    );
  }

  private avisoMinimo(item: Item): string {
    return item.estoque <= item.estoque_minimo
      ? `\n${linhaAlerta({ codigo: item.codigo, nome: item.nome, estoque: item.estoque, estoque_minimo: item.estoque_minimo })}`
      : "";
  }

  async estoqueBaixo(): Promise<string> {
    const lista = await this.repo.itensEstoqueBaixo();
    if (lista.length === 0) return "✅ Nenhum item com estoque baixo.";
    return `⚠️ Estoque baixo (${lista.length}):\n${lista
      .map((i) => `• ${i.codigo} — ${i.nome}: ${i.estoque} (mínimo ${i.estoque_minimo})`)
      .join("\n")}`;
  }

  async clienteNovo(args: string): Promise<string> {
    const c = await this.repo.criarCliente(parseClienteNovo(args));
    return `✅ Cliente cadastrado: ${c.nome}${c.telefone ? ` | ${c.telefone}` : ""}`;
  }

  async clientes(args: string): Promise<string> {
    const busca = args.trim() || undefined;
    const lista = await this.repo.listarClientes(busca);
    if (lista.length === 0) {
      return busca
        ? `👥 Nenhum cliente encontrado para "${busca}".`
        : "👥 Nenhum cliente cadastrado ainda. Use /cliente_novo para cadastrar.";
    }
    return `👥 Clientes (${lista.length}):\n${lista
      .map((c) => `• ${c.nome}${c.telefone ? ` | ${c.telefone}` : ""}${c.obs ? ` | ${c.obs}` : ""}`)
      .join("\n")}`;
  }

  async venda(args: string): Promise<string> {
    const { cliente, forma, itens } = parseVenda(args);
    let clienteId: number | null = null;
    if (cliente !== null) {
      const c = await this.repo.buscarClientePorNome(cliente);
      if (!c) {
        throw new ErroUsuario(
          `Cliente "${cliente}" não encontrado. Cadastre com /cliente_novo ${cliente} ou use - para venda sem cliente.`,
        );
      }
      clienteId = c.id;
    }
    const r = await this.repo.registrarVenda(clienteId, forma, itens);
    const linhas = r.itens.map(
      (i) =>
        `• ${i.quantidade}x ${i.codigo} (${i.nome}) — ${formatarReais(i.preco_unitario)} = ${formatarReais(i.subtotal)}`,
    );
    const partes = [
      `✅ Venda #${r.venda_id} registrada`,
      `👤 ${cliente ?? "sem cliente"} | 💳 ${NOME_FORMA[forma]}`,
      ...linhas,
      `💰 Total: ${formatarReais(r.total)}`,
    ];
    if (r.alertas.length > 0) {
      partes.push("", "Estoque baixo:", ...r.alertas.map(linhaAlerta));
    }
    return partes.join("\n");
  }

  async vendasHoje(agora: Date): Promise<string> {
    const lista = await this.repo.vendasDoDia(agora);
    if (lista.length === 0) return "🧾 Nenhuma venda registrada hoje.";
    const total = lista.reduce((s, v) => s + v.total, 0);
    const linhas = lista.map(
      (v) =>
        `• #${v.id} — ${v.cliente_nome ?? "sem cliente"} | ${NOME_FORMA[v.forma_pagamento]} | ${formatarReais(v.total)}`,
    );
    return `🧾 Vendas de hoje (${lista.length}):\n${linhas.join("\n")}\n💰 Total do dia: ${formatarReais(Math.round(total * 100) / 100)}`;
  }
}

/** Despacha o comando e transforma ErroUsuario em "❌ mensagem". */
export async function responder(
  servicos: Servicos,
  comando: string,
  args: string,
  agora: Date,
): Promise<string> {
  const cmd = comando.trim().replace(/^\//, "").replace(/@.*$/, "").toLowerCase();
  try {
    switch (cmd) {
      case "start":
      case "ajuda":
        return await servicos.ajuda();
      case "item_novo":
        return await servicos.itemNovo(args);
      case "itens":
        return await servicos.itens(args);
      case "entrada":
        return await servicos.entrada(args);
      case "ajuste":
        return await servicos.ajuste(args);
      case "estoque_baixo":
        return await servicos.estoqueBaixo();
      case "cliente_novo":
        return await servicos.clienteNovo(args);
      case "clientes":
        return await servicos.clientes(args);
      case "venda":
        return await servicos.venda(args);
      case "vendas_hoje":
        return await servicos.vendasHoje(agora);
      default:
        return "❓ Comando desconhecido. Use /ajuda para ver os comandos.";
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return `❌ ${e.message}`;
    throw e;
  }
}
