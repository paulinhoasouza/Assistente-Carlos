import { beforeEach, describe, expect, it } from "vitest";
import { ErroUsuario } from "../src/core/erros.js";
import { Servicos, responder } from "../src/core/servicos.js";
import { RepositorioMemoria } from "../src/db/memory.js";

let repo: RepositorioMemoria;
let s: Servicos;
const agora = new Date();

beforeEach(async () => {
  repo = new RepositorioMemoria();
  s = new Servicos(repo);
  await s.itemNovo("CAM01 | Camiseta preta | 49,90 | 20 | un | 5 | 30");
  await s.itemNovo("BON01 | Boné | 30 | | un | 2 | 3");
  await s.clienteNovo("Maria Silva | 11999990000");
});

const estoque = async (cod: string) => (await repo.buscarItemPorCodigo(cod))!.estoque;

describe("venda", () => {
  it("feliz: baixa estoque e calcula total", async () => {
    const txt = await s.venda("Maria Silva | pix | CAM01 x2, BON01 x1");
    expect(txt).toContain("R$ 129,80");
    expect(await estoque("CAM01")).toBe(28);
    expect(await estoque("BON01")).toBe(2);
  });

  it("cliente é buscado sem diferenciar maiúsculas", async () => {
    await expect(s.venda("maria silva | fiado | CAM01")).resolves.toContain("Venda #1");
  });

  it("sem saldo é recusada e não altera nenhum estoque", async () => {
    await expect(s.venda("- | pix | CAM01 x2, BON01 x5")).rejects.toThrow(/Estoque insuficiente para BON01/);
    expect(await estoque("CAM01")).toBe(30);
    expect(await estoque("BON01")).toBe(3);
    expect(await repo.vendasDoDia(agora)).toHaveLength(0);
  });

  it("soma códigos repetidos", async () => {
    const txt = await s.venda("- | dinheiro | CAM01 x2, CAM01 x3");
    expect(await estoque("CAM01")).toBe(25);
    expect(txt).toContain("R$ 249,50");
    await expect(s.venda("- | dinheiro | BON01 x2, BON01 x2")).rejects.toThrow(/disponível 3, pedido 4/);
  });

  it("fiado sem cliente é recusado", async () => {
    await expect(s.venda("- | fiado | CAM01")).rejects.toThrow(/fiado exige cliente/i);
    expect(await estoque("CAM01")).toBe(30);
  });

  it("cliente inexistente sugere /cliente_novo", async () => {
    await expect(s.venda("Fulano | pix | CAM01")).rejects.toThrow(/cliente_novo/);
  });

  it("item inexistente é recusado", async () => {
    await expect(s.venda("- | pix | ZZZ99")).rejects.toThrow(/Item ZZZ99 não encontrado/);
  });

  it("alerta de estoque mínimo após a venda", async () => {
    const txt = await s.venda("- | pix | BON01 x1");
    expect(txt).toContain("⚠️ BON01");
    const semAlerta = await s.venda("- | pix | CAM01 x1");
    expect(semAlerta).not.toContain("⚠️");
  });
});

describe("estoque", () => {
  it("entrada soma ao estoque", async () => {
    const txt = await s.entrada("BON01 | 10 | compra");
    expect(await estoque("BON01")).toBe(13);
    expect(txt).not.toContain("⚠️");
  });

  it("entrada ainda abaixo do mínimo avisa", async () => {
    await s.ajuste("BON01 | 0");
    expect(await s.entrada("BON01 | 1")).toContain("⚠️");
  });

  it("ajuste define o estoque e avisa se <= mínimo", async () => {
    const txt = await s.ajuste("CAM01 | 4 | contagem");
    expect(await estoque("CAM01")).toBe(4);
    expect(txt).toContain("⚠️");
  });

  it("ajuste negativo é recusado", async () => {
    await expect(s.ajuste("CAM01 | -1")).rejects.toThrow(ErroUsuario);
    await expect(repo.ajustarEstoque("CAM01", -1)).rejects.toThrow(ErroUsuario);
    expect(await estoque("CAM01")).toBe(30);
  });

  it("estoque baixo e listas vazias", async () => {
    expect(await s.estoqueBaixo()).toContain("Nenhum item");
    await s.ajuste("BON01 | 1");
    expect(await s.estoqueBaixo()).toContain("BON01");
    const vazio = new Servicos(new RepositorioMemoria());
    expect(await vazio.itens("")).toContain("Nenhum item cadastrado");
    expect(await vazio.clientes("")).toContain("Nenhum cliente cadastrado");
    expect(await vazio.vendasHoje(agora)).toContain("Nenhuma venda");
  });
});

describe("cadastros", () => {
  it("código de item duplicado é recusado", async () => {
    await expect(s.itemNovo("cam01 | Outra | 10")).rejects.toThrow(/Já existe um item/);
  });
  it("cliente duplicado é recusado", async () => {
    await expect(s.clienteNovo("MARIA SILVA")).rejects.toThrow(/Já existe um cliente/);
  });
});

describe("vendasHoje", () => {
  it("soma o total do dia", async () => {
    await s.venda("Maria Silva | pix | CAM01 x2");
    await s.venda("- | dinheiro | BON01 x1");
    const txt = await s.vendasHoje(agora);
    expect(txt).toContain("R$ 129,80");
    expect(txt).toContain("Maria Silva");
  });

  it("não inclui vendas de outro dia", async () => {
    const ontem = new Date(agora.getTime() - 2 * 24 * 3600 * 1000);
    const r = new RepositorioMemoria(() => ontem);
    const sv = new Servicos(r);
    await sv.itemNovo("A | A | 10 | | | | 5");
    await sv.venda("- | pix | A");
    expect(await sv.vendasHoje(agora)).toContain("Nenhuma venda");
  });
});

describe("responder", () => {
  it("transforma ErroUsuario em ❌ e despacha comandos", async () => {
    expect(await responder(s, "/venda", "- | boleto | CAM01", agora)).toMatch(/^❌ /);
    expect(await responder(s, "/ajuda", "", agora)).toContain("/venda");
    expect(await responder(s, "/itens@meubot", "cam", agora)).toContain("CAM01");
  });
  it("relança erros que não são ErroUsuario", async () => {
    const quebrado = new Servicos({} as never);
    await expect(responder(quebrado, "/itens", "", agora)).rejects.toThrow(TypeError);
  });
});
