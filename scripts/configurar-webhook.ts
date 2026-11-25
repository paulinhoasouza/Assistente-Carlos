import { Bot } from "grammy";
import { COMANDOS } from "../src/bot/criarBot.js";

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ausente: ${nome}`);
  return v;
}

const base = process.argv[2];
if (!base) {
  console.error("Uso: npx tsx scripts/configurar-webhook.ts <url-da-vercel>");
  process.exit(1);
}

const url = `${base.replace(/\/+$/, "")}/api/telegram`;
const bot = new Bot(env("TELEGRAM_BOT_TOKEN"));
await bot.api.setWebhook(url, {
  secret_token: env("TELEGRAM_WEBHOOK_SECRET"),
  allowed_updates: ["message"],
});
await bot.api.setMyCommands(COMANDOS);
console.log(`Webhook configurado: ${url}`);
