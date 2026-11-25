import { Bot } from "grammy";
import type { BotFullInfo } from "grammy/types";
import { Servicos, responder } from "../core/servicos.js";
import type { Repositorio } from "../db/repo.js";

export const COMANDOS: { command: string; description: string }[] = [
  { command: "start", description: "Mostra os comandos" },
  { command: "ajuda", description: "Mostra os comandos" },
  { command: "item_novo", description: "Cadastra um item" },
  { command: "itens", description: "Lista itens e estoque" },
  { command: "entrada", description: "Registra entrada de estoque" },
  { command: "ajuste", description: "Ajusta o estoque (contagem)" },
  { command: "estoque_baixo", description: "Itens com estoque baixo" },
  { command: "cliente_novo", description: "Cadastra um cliente" },
  { command: "clientes", description: "Lista clientes" },
  { command: "venda", description: "Registra uma venda" },
  { command: "vendas_hoje", description: "Vendas do dia" },
];

export interface OpcoesBot {
  token: string;
  ownerId: number;
  repo: Repositorio;
  agora?: () => Date;
  /** Opcional: botInfo pré-definido (evita getMe; útil em testes). */
  botInfo?: BotFullInfo;
}

export function criarBot(op: OpcoesBot): Bot {
  const agora = op.agora ?? (() => new Date());
  const servicos = new Servicos(op.repo);
  const bot = new Bot(op.token, op.botInfo ? { botInfo: op.botInfo } : undefined);

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== op.ownerId) {
      await ctx.reply("⛔ Acesso negado.");
      return;
    }
    await next();
  });

  for (const { command } of COMANDOS) {
    bot.command(command, async (ctx) => {
      const texto = await responder(servicos, command, ctx.match, agora());
      await ctx.reply(texto);
    });
  }

  bot.on("message:text", async (ctx) => {
    await ctx.reply("Use /ajuda");
  });

  bot.catch(async (err) => {
    console.error("Erro no bot:", err.error);
    try {
      await err.ctx.reply("⚠️ Erro inesperado, tente de novo.");
    } catch (e) {
      console.error("Falha ao avisar o erro:", e);
    }
  });

  return bot;
}
