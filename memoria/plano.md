# Plano — Bot Telegram de estoque (itens, clientes, vendas)

Regras e contrato: memoria/decisoes.md

| # | Etapa | Critério de pronto | Status |
|---|---|---|---|
| 1 | ESQUELETO DO PROJETO | `npm install` ok e `npm run typecheck` roda | ✅ concluída (typecheck ok) |
| 2 | MIGRAÇÃO SUPABASE | supabase/migrations/0001_estoque.sql com tabelas, RLS e funções `registrar_venda`, `registrar_entrada`, `ajustar_estoque` | ✅ concluída (testada em Postgres 16 local) |
| 3 | NÚCLEO + TESTES | `npm test` passa cobrindo parse, venda sem saldo, fiado sem cliente, alerta de mínimo | ✅ concluída (32 testes) |
| 4 | BOT + SUPABASE + WEBHOOK | `npm run typecheck` e `npm test` passam com src/bot, src/db/supabase.ts e api/telegram.ts | ✅ concluída (39 testes) |
| 5 | README E DEPLOY | README com passo a passo (BotFather, Supabase, Vercel, setWebhook) | ✅ concluída (2 diagramas Mermaid) |
| 6 | CONFERÊNCIA FINAL | orquestrador roda typecheck + testes e confere o SQL | ✅ concluída (typecheck ok, 39/39 testes) |

## Pendências (fora do código)
- Aplicar supabase/migrations/0001_estoque.sql no projeto Supabase real.
- Criar bot no BotFather, configurar as 5 variáveis na Vercel, deploy e `npm run webhook -- <url>`.
- Melhoria futura: criar item com estoque inicial de forma atômica (função SQL); decidir se item inativo pode ser vendido.
