import { webhookCallback } from "grammy";
import { criarBot } from "../src/bot/criarBot.js";
import { criarRepositorioSupabase } from "../src/db/supabase.js";

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return v;
}

let handler: ((req: Request) => Promise<Response>) | undefined;

function obterHandler(): (req: Request) => Promise<Response> {
  if (!handler) {
    const token = env("TELEGRAM_BOT_TOKEN");
    const ownerId = Number(env("TELEGRAM_OWNER_ID"));
    if (!Number.isInteger(ownerId)) throw new Error("TELEGRAM_OWNER_ID deve ser um número inteiro.");
    const secretToken = env("TELEGRAM_WEBHOOK_SECRET");
    const repo = criarRepositorioSupabase(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const bot = criarBot({ token, ownerId, repo });
    handler = webhookCallback(bot, "std/http", { secretToken });
  }
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  return obterHandler()(request);
}

export async function GET(): Promise<Response> {
  return new Response("ok");
}
