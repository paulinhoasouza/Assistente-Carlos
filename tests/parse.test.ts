import { describe, expect, it } from "vitest";
import { ErroUsuario } from "../src/core/erros.js";
import {
  parseAjuste,
  parseClienteNovo,
  parseDinheiro,
  parseEntrada,
  parseInteiro,
  parseItemNovo,
  parseVenda,
} from "../src/core/parse.js";

describe("parseDinheiro", () => {
  it("aceita vírgula, ponto e R$", () => {
    expect(parseDinheiro("49,90")).toBe(49.9);
    expect(parseDinheiro("49.90")).toBe(49.9);
    expect(parseDinheiro("R$ 49,90")).toBe(49.9);
    expect(parseDinheiro("1.234,50")).toBe(1234.5);
    expect(parseDinheiro("10")).toBe(10);
  });
  it("recusa inválido", () => {
    expect(() => parseDinheiro("abc")).toThrow(ErroUsuario);
    expect(() => parseDinheiro("-5")).toThrow(ErroUsuario);
    expect(() => parseDinheiro("1,999")).toThrow(ErroUsuario);
  });
});

describe("parseInteiro", () => {
  it("valida inteiros", () => {
    expect(parseInteiro(" 12 ")).toBe(12);
    expect(() => parseInteiro("1,5")).toThrow(ErroUsuario);
  });
});

describe("parseItemNovo", () => {
  it("lê todos os campos e põe o código em maiúsculo", () => {
    expect(parseItemNovo("cam01 | Camiseta preta | 49,90 | 20 | un | 5 | 30")).toEqual({
      codigo: "CAM01",
      nome: "Camiseta preta",
      preco: 49.9,
      custo: 20,
      unidade: "un",
      estoque_minimo: 5,
      estoque_inicial: 30,
    });
  });
  it("usa padrões nos opcionais", () => {
    const r = parseItemNovo("BON01 | Boné | 30");
    expect(r).toMatchObject({ custo: null, unidade: "un", estoque_minimo: 0, estoque_inicial: 0 });
  });
  it("mostra o formato quando faltam campos", () => {
    expect(() => parseItemNovo("BON01 | Boné")).toThrow(/Formato: \/item_novo/);
  });
});

describe("parseEntrada / parseAjuste / parseClienteNovo", () => {
  it("entrada", () => {
    expect(parseEntrada("cam01 | 10 | compra")).toEqual({ codigo: "CAM01", quantidade: 10, motivo: "compra" });
    expect(() => parseEntrada("CAM01 | 0")).toThrow(ErroUsuario);
    expect(() => parseEntrada("CAM01")).toThrow(/Formato: \/entrada/);
  });
  it("ajuste", () => {
    expect(parseAjuste("cam01 | 27")).toEqual({ codigo: "CAM01", novoEstoque: 27 });
    expect(() => parseAjuste("CAM01 | -3")).toThrow(ErroUsuario);
  });
  it("cliente", () => {
    expect(parseClienteNovo("Maria Silva | 11999990000")).toEqual({
      nome: "Maria Silva",
      telefone: "11999990000",
      obs: null,
    });
    expect(() => parseClienteNovo("")).toThrow(ErroUsuario);
  });
});

describe("parseVenda", () => {
  it("aceita os formatos de item", () => {
    const r = parseVenda("Maria Silva | pix | CAM01 x2, bon01x3, ABC 4, XYZ");
    expect(r.cliente).toBe("Maria Silva");
    expect(r.forma).toBe("pix");
    expect(r.itens).toEqual([
      { codigo: "CAM01", quantidade: 2 },
      { codigo: "BON01", quantidade: 3 },
      { codigo: "ABC", quantidade: 4 },
      { codigo: "XYZ", quantidade: 1 },
    ]);
  });
  it('"-" vira cliente null e pagamento aceita acento/maiúsculas', () => {
    const r = parseVenda("- | CARTÃO | CAM01");
    expect(r.cliente).toBeNull();
    expect(r.forma).toBe("cartao");
  });
  it("recusa pagamento inválido mostrando o formato", () => {
    expect(() => parseVenda("- | boleto | CAM01")).toThrow(/Forma de pagamento inválida/);
    expect(() => parseVenda("- | boleto | CAM01")).toThrow(/\/venda cliente/);
  });
  it("recusa venda incompleta e quantidade zero", () => {
    expect(() => parseVenda("pix | CAM01")).toThrow(/Formato: \/venda/);
    expect(() => parseVenda("- | pix | CAM01 x0")).toThrow(ErroUsuario);
  });
});
