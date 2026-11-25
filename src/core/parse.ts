import { ErroUsuario } from "./erros.js";
import type {
  FormaPagamento,
  NovoCliente,
  NovoItem,
  VendaItemEntrada,
} from "./tipos.js";

export const FORMATOS = {
  item_novo: "/item_novo codigo | nome | preco [| custo | unidade | minimo | estoque_inicial]",
  entrada: "/entrada codigo | quantidade [| motivo]",
  ajuste: "/ajuste codigo | novo_estoque [| motivo]",
  cliente_novo: "/cliente_novo nome [| telefone | obs]",
  venda: "/venda cliente | pagamento | COD xQTD, COD xQTD",
} as const;

const EXEMPLOS = {
  item_novo: "/item_novo CAM01 | Camiseta preta | 49,90 | 20 | un | 5 | 30",
  entrada: "/entrada CAM01 | 10 | compra fornecedor",
  ajuste: "/ajuste CAM01 | 27 | contagem",
  cliente_novo: "/cliente_novo Maria Silva | 11999990000",
  venda: "/venda Maria Silva | pix | CAM01 x2, BON01 x1",
} as const;

function formato(cmd: keyof typeof FORMATOS): string {
  return `Formato: ${FORMATOS[cmd]}\nExemplo: ${EXEMPLOS[cmd]}`;
}

function campos(texto: string): string[] {
  return texto.split("|").map((c) => c.trim());
}

function opcional(c: string[], i: number): string | undefined {
  const v = c[i];
  return v === undefined || v === "" ? undefined : v;
}

export function parseDinheiro(texto: string): number {
  let t = texto.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    throw new ErroUsuario(
      `Valor inválido: "${texto.trim()}". Use algo como 49,90 ou 49.90.`,
    );
  }
  return Number(t);
}

export function parseInteiro(texto: string, nomeCampo = "número"): number {
  const t = texto.trim();
  if (!/^\d+$/.test(t)) {
    throw new ErroUsuario(
      `${nomeCampo} inválido: "${t}". Use um número inteiro (0, 1, 2...).`,
    );
  }
  return Number(t);
}

function exigirCodigo(v: string | undefined, cmd: keyof typeof FORMATOS): string {
  if (!v) throw new ErroUsuario(`Faltou o código do item.\n${formato(cmd)}`);
  return v.toUpperCase();
}

export function parseItemNovo(texto: string): NovoItem {
  const c = campos(texto);
  if (c.length > 7) throw new ErroUsuario(`Campos demais.\n${formato("item_novo")}`);
  const codigo = exigirCodigo(opcional(c, 0), "item_novo");
  const nome = opcional(c, 1);
  const precoTxt = opcional(c, 2);
  if (!nome || !precoTxt) {
    throw new ErroUsuario(`Faltam campos obrigatórios (código, nome e preço).\n${formato("item_novo")}`);
  }
  const custoTxt = opcional(c, 3);
  const minTxt = opcional(c, 5);
  const iniTxt = opcional(c, 6);
  return {
    codigo,
    nome,
    preco: parseDinheiro(precoTxt),
    custo: custoTxt === undefined ? null : parseDinheiro(custoTxt),
    unidade: opcional(c, 4) ?? "un",
    estoque_minimo: minTxt === undefined ? 0 : parseInteiro(minTxt, "Estoque mínimo"),
    estoque_inicial: iniTxt === undefined ? 0 : parseInteiro(iniTxt, "Estoque inicial"),
  };
}

export function parseEntrada(texto: string): { codigo: string; quantidade: number; motivo?: string } {
  const c = campos(texto);
  const q = opcional(c, 1);
  if (c.length > 3 || !q) throw new ErroUsuario(`${formato("entrada")}`);
  const codigo = exigirCodigo(opcional(c, 0), "entrada");
  const quantidade = parseInteiro(q, "Quantidade");
  if (quantidade <= 0) throw new ErroUsuario("A quantidade deve ser maior que zero.");
  const motivo = opcional(c, 2);
  return motivo === undefined ? { codigo, quantidade } : { codigo, quantidade, motivo };
}

export function parseAjuste(texto: string): { codigo: string; novoEstoque: number; motivo?: string } {
  const c = campos(texto);
  const q = opcional(c, 1);
  if (c.length > 3 || !q) throw new ErroUsuario(`${formato("ajuste")}`);
  const codigo = exigirCodigo(opcional(c, 0), "ajuste");
  if (/^-/.test(q)) throw new ErroUsuario("O novo estoque não pode ser negativo.");
  const novoEstoque = parseInteiro(q, "Novo estoque");
  const motivo = opcional(c, 2);
  return motivo === undefined ? { codigo, novoEstoque } : { codigo, novoEstoque, motivo };
}

export function parseClienteNovo(texto: string): NovoCliente {
  const c = campos(texto);
  const nome = opcional(c, 0);
  if (c.length > 3 || !nome) throw new ErroUsuario(`${formato("cliente_novo")}`);
  return { nome, telefone: opcional(c, 1) ?? null, obs: opcional(c, 2) ?? null };
}

export function parseFormaPagamento(texto: string): FormaPagamento {
  const t = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (t === "dinheiro" || t === "pix" || t === "cartao" || t === "fiado") return t;
  throw new ErroUsuario(
    `Forma de pagamento inválida: "${texto.trim()}". Use dinheiro, pix, cartao ou fiado.\n${formato("venda")}`,
  );
}

function parseLinhaItem(token: string): VendaItemEntrada {
  const t = token.trim();
  const m =
    /^(\S+?)\s*x\s*(\d+)$/i.exec(t) ?? /^(\S+)\s+(\d+)$/.exec(t) ?? /^(\S+)$/.exec(t);
  if (!m) {
    throw new ErroUsuario(`Item inválido: "${t}". Use CODIGO xQTD (ex.: CAM01 x2).`);
  }
  const quantidade = m[2] === undefined ? 1 : Number(m[2]);
  if (quantidade <= 0) {
    throw new ErroUsuario(`Quantidade inválida em "${t}": deve ser maior que zero.`);
  }
  return { codigo: m[1]!.toUpperCase(), quantidade };
}

export function parseVenda(texto: string): {
  cliente: string | null;
  forma: FormaPagamento;
  itens: VendaItemEntrada[];
} {
  const c = campos(texto);
  if (c.length !== 3 || !c[1] || !c[2]) {
    throw new ErroUsuario(`Venda incompleta.\n${formato("venda")}`);
  }
  const cliente = c[0] === "" || c[0] === "-" ? null : c[0]!;
  const forma = parseFormaPagamento(c[1]);
  const pedacos = c[2].split(",").map((p) => p.trim());
  if (pedacos.some((p) => p === "")) {
    throw new ErroUsuario(`Lista de itens inválida (vírgula sobrando).\n${formato("venda")}`);
  }
  return { cliente, forma, itens: pedacos.map(parseLinhaItem) };
}
