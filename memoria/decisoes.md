# Decisões do projeto — Bot Telegram de estoque

## Stack
- Node 20 + TypeScript (ESM), framework de bot **grammY**, banco **Supabase** (Postgres) via `@supabase/supabase-js`, testes com **vitest**.
- Hospedagem: **Vercel**, função serverless `api/telegram.ts` recebendo o webhook do Telegram.
- Sem estado de conversa: cada comando traz tudo numa linha, campos separados por `|`. (Funciona em serverless sem sessão.)

## Regras de negócio
- Só o dono usa o bot: mensagens de quem não for `TELEGRAM_OWNER_ID` são ignoradas com "Acesso negado".
- Webhook protegido por `TELEGRAM_WEBHOOK_SECRET` (header `X-Telegram-Bot-Api-Secret-Token`).
- Item: `codigo` (único, maiúsculo), `nome`, `unidade` (padrão "un"), `preco` (venda), `custo` (opcional), `estoque` (inteiro ≥ 0), `estoque_minimo` (padrão 0).
- Estoque só muda por movimento registrado: `entrada`, `saida` (venda) ou `ajuste` (contagem). Tudo fica em `movimentos_estoque`.
- **Venda baixa o estoque automaticamente**, na mesma transação. **Não vende sem saldo**: se faltar, a venda inteira é recusada e diz qual item faltou.
- Formas de pagamento: `dinheiro`, `pix`, `cartao`, `fiado`. Fiado exige cliente.
- Cliente é opcional na venda (exceto fiado). Venda referencia cliente pelo nome (busca sem diferenciar maiúsculas) ou "-" para sem cliente.
- Depois de cada venda/ajuste, se algum item ficar com `estoque <= estoque_minimo`, o bot avisa ⚠️.
- Dinheiro em reais com 2 casas; aceita "49,90" ou "49.90" na entrada.

## Comandos
| Comando | Formato | Exemplo |
|---|---|---|
| /start, /ajuda | — | lista os comandos |
| /item_novo | `codigo \| nome \| preco [\| custo \| unidade \| minimo \| estoque_inicial]` | `/item_novo CAM01 \| Camiseta preta \| 49,90 \| 20 \| un \| 5 \| 30` |
| /itens | `[busca]` | `/itens cam` |
| /entrada | `codigo \| quantidade [\| motivo]` | `/entrada CAM01 \| 10 \| compra fornecedor` |
| /ajuste | `codigo \| novo_estoque [\| motivo]` | `/ajuste CAM01 \| 27 \| contagem` |
| /estoque_baixo | — | itens com estoque ≤ mínimo |
| /cliente_novo | `nome [\| telefone \| obs]` | `/cliente_novo Maria Silva \| 11999990000` |
| /clientes | `[busca]` | `/clientes mar` |
| /venda | `cliente \| pagamento \| COD xQTD, COD xQTD` | `/venda Maria Silva \| pix \| CAM01 x2, BON01 x1` |
| /vendas_hoje | — | total do dia e lista |

## Contrato de código (para os executores seguirem)
- `src/core/tipos.ts`: tipos `Item`, `Cliente`, `Venda`, `VendaItemEntrada {codigo, quantidade}`, `FormaPagamento`.
- `src/core/parse.ts`: funções puras que transformam o texto de cada comando em objeto, ou lançam `ErroUsuario` com mensagem amigável.
- `src/db/repo.ts`: interface `Repositorio` com: `criarItem`, `listarItens(busca?)`, `buscarItemPorCodigo`, `registrarEntrada`, `ajustarEstoque`, `itensEstoqueBaixo`, `criarCliente`, `listarClientes(busca?)`, `buscarClientePorNome`, `registrarVenda`, `vendasDoDia(data)`.
- `src/db/memory.ts`: implementação em memória (usada nos testes) com as MESMAS regras do SQL.
- `src/db/supabase.ts`: implementação real; `registrarVenda`, `registrarEntrada` e `ajustarEstoque` chamam funções SQL via `rpc`.
- `src/core/servicos.ts`: orquestra parse + repo e devolve o texto da resposta.
- `src/bot/criarBot.ts`: `criarBot({token, ownerId, repo})` registra os comandos.
- `api/telegram.ts`: monta o bot com o repo Supabase e exporta o handler `webhookCallback(bot, "std/http")`.
