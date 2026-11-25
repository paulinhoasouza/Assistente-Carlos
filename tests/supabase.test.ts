import { describe, expect, it } from "vitest";
import { ErroUsuario } from "../src/core/erros.js";
import { RepositorioSupabase } from "../src/db/supabase.js";

type Resp = { data?: unknown; error?: { code?: string; message: string } | null };

/** Builder encadeável e "thenable" que devolve a resposta configurada. */
function builder(resp: Resp) {
  const b: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (res: (v: unknown) => void) => res({ data: null, error: null, ...resp });
        return () => b;
      },
    },
  );
  return b;
}

function fake(opts: { from?: Resp; rpc?: Resp }) {
  return {
    from: () => builder(opts.from ?? {}),
    rpc: async () => ({ data: null, error: null, ...opts.rpc }),
  } as any;
}

const novoItem = {
  codigo: "cam01",
  nome: "Camiseta",
  preco: 10,
  custo: null,
  unidade: "un",
  estoque_minimo: 0,
  estoque_inicial: 0,
};

describe("RepositorioSupabase", () => {
  it("P0001 do rpc vira ErroUsuario com ponto final", async () => {
    const repo = new RepositorioSupabase(
      fake({ rpc: { error: { code: "P0001", message: "Estoque insuficiente para CAM01: disponível 1, pedido 2" } } }),
    );
    const p = repo.registrarVenda(null, "pix", [{ codigo: "CAM01", quantidade: 2 }]);
    await expect(p).rejects.toBeInstanceOf(ErroUsuario);
    await expect(p).rejects.toThrow("Estoque insuficiente para CAM01: disponível 1, pedido 2.");
  });

  it("23505 no criarItem vira ErroUsuario", async () => {
    const repo = new RepositorioSupabase(fake({ from: { error: { code: "23505", message: "duplicate key" } } }));
    const p = repo.criarItem(novoItem);
    await expect(p).rejects.toBeInstanceOf(ErroUsuario);
    await expect(p).rejects.toThrow("Já existe um item com o código CAM01.");
  });

  it("outros erros viram Error comum", async () => {
    const repo = new RepositorioSupabase(fake({ from: { error: { code: "XX000", message: "boom" } } }));
    const p = repo.criarItem(novoItem);
    await expect(p).rejects.not.toBeInstanceOf(ErroUsuario);
    await expect(p).rejects.toThrow("boom");
  });

  it("numeric string vira number no registrarVenda", async () => {
    const repo = new RepositorioSupabase(
      fake({
        rpc: {
          data: {
            venda_id: 7,
            total: "99.80",
            itens: [
              { codigo: "CAM01", nome: "Camiseta", quantidade: 2, preco_unitario: "49.90", subtotal: "99.80", estoque_apos: "28" },
            ],
            alertas: [{ codigo: "CAM01", nome: "Camiseta", estoque: "28", estoque_minimo: "30" }],
          },
        },
      }),
    );
    const r = await repo.registrarVenda(null, "pix", [{ codigo: "CAM01", quantidade: 2 }]);
    expect(r.total).toBe(99.8);
    expect(r.itens[0]).toMatchObject({ preco_unitario: 49.9, subtotal: 99.8, estoque_apos: 28 });
    expect(typeof r.alertas[0]!.estoque).toBe("number");
  });
});
