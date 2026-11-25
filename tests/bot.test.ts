import { describe, expect, it } from "vitest";
import { criarBot } from "../src/bot/criarBot.js";
import { RepositorioMemoria } from "../src/db/memory.js";

const DONO = 111;
const botInfo = {
  id: 1,
  is_bot: true as const,
  first_name: "Bot",
  username: "bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  supports_guest_queries: false,
  needs_inline_query_location: false,
  has_topic_sidebar: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

function montar() {
  const repo = new RepositorioMemoria();
  const bot = criarBot({ token: "123:FAKE", ownerId: DONO, repo, botInfo, agora: () => new Date() });
  const capturado: { method: string; payload: any }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    capturado.push({ method, payload });
    return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } } } as any;
  });
  let n = 0;
  const enviar = async (de: number, texto: string) => {
    const cmd = texto.startsWith("/") ? texto.split(/\s/)[0]!.length : 0;
    await bot.handleUpdate({
      update_id: ++n,
      message: {
        message_id: n,
        date: 0,
        chat: { id: de, type: "private", first_name: "X" },
        from: { id: de, is_bot: false, first_name: "X" },
        text: texto,
        ...(cmd ? { entities: [{ type: "bot_command", offset: 0, length: cmd }] } : {}),
      },
    } as any);
  };
  const textos = () => capturado.filter((c) => c.method === "sendMessage").map((c) => c.payload.text as string);
  return { repo, enviar, textos };
}

describe("criarBot", () => {
  it("dono cadastra item e vende; estoque baixa", async () => {
    const { repo, enviar, textos } = montar();
    await enviar(DONO, "/item_novo CAM01 | Camiseta preta | 49,90 | 20 | un | 5 | 30");
    expect((await repo.buscarItemPorCodigo("CAM01"))?.estoque).toBe(30);
    await enviar(DONO, "/venda - | pix | CAM01 x2");
    expect((await repo.buscarItemPorCodigo("CAM01"))?.estoque).toBe(28);
    const t = textos();
    expect(t).toHaveLength(2);
    expect(t.some((x) => x.includes("❌") || x.includes("Acesso negado"))).toBe(false);
  });

  it("outro usuário recebe Acesso negado e nada é gravado", async () => {
    const { repo, enviar, textos } = montar();
    await enviar(999, "/item_novo CAM01 | Camiseta | 10");
    expect(textos()).toEqual(["⛔ Acesso negado."]);
    expect(await repo.listarItens()).toHaveLength(0);
  });

  it("texto que não é comando responde com a ajuda curta", async () => {
    const { enviar, textos } = montar();
    await enviar(DONO, "oi");
    expect(textos()).toEqual(["Use /ajuda"]);
  });
});
