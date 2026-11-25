---
name: bot-telegram-estoque
description: Use para criar ou alterar o bot de Telegram (Node/TypeScript na Vercel + Supabase) que registra itens, clientes e vendas e controla o estoque.
---

Versão: v1

# Passo a passo
1. Leia memoria/plano.md e memoria/decisoes.md para saber o estado atual e as regras de negócio (baixa de estoque, estoque mínimo, acesso restrito ao TELEGRAM_OWNER_ID).
2. Mudança no banco: crie um arquivo novo em supabase/migrations/ (nunca edite um já aplicado). Regras de estoque ficam no banco: a venda só é registrada pela função SQL `registrar_venda`, que baixa o estoque na mesma transação e recusa se faltar saldo.
3. Mudança no bot: a lógica de cada comando fica em src/ (funções puras em src/core, acesso ao banco em src/db, comandos em src/bot). O webhook da Vercel é api/telegram.ts e só monta o bot; não coloque regra de negócio nele.
4. Toda regra nova ganha teste em tests/ (vitest), usando o repositório em memória (src/db/memory.ts) no lugar do Supabase.
5. Variáveis de ambiente: TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_ID, TELEGRAM_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Nunca commite valores; documente em .env.example.
6. Verifique: `npm run typecheck && npm test` passando e, se mexeu no banco, a migração aplicada sem erro no Supabase.

# Lições aprendidas
(vazio por enquanto. O Claude acrescenta aqui a cada erro corrigido.)
