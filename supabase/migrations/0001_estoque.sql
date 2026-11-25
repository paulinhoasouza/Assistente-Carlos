-- 0001_estoque.sql — estoque, clientes e vendas do bot do Telegram.
-- RLS ligado e SEM policies: só a service_role (que ignora RLS) acessa.

-- Itens do estoque
create table public.itens (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  codigo text not null unique check (codigo = upper(codigo)),
  nome text not null,
  unidade text not null default 'un',
  preco numeric(12,2) not null check (preco >= 0),
  custo numeric(12,2) check (custo >= 0),
  estoque integer not null default 0 check (estoque >= 0),
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true
);

-- Clientes (nome único sem diferenciar maiúsculas)
create table public.clientes (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  nome text not null,
  telefone text,
  obs text
);
create unique index clientes_nome_lower_uq on public.clientes (lower(nome));

-- Vendas (fiado exige cliente)
create table public.vendas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  cliente_id bigint references public.clientes (id),
  forma_pagamento text not null
    check (forma_pagamento in ('dinheiro','pix','cartao','fiado')),
  total numeric(12,2) not null,
  constraint vendas_fiado_exige_cliente
    check (forma_pagamento <> 'fiado' or cliente_id is not null)
);

-- Linhas da venda
create table public.venda_itens (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  venda_id bigint not null references public.vendas (id) on delete cascade,
  item_id bigint not null references public.itens (id),
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

-- Histórico de movimentos (quantidade = delta com sinal)
create table public.movimentos_estoque (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  item_id bigint not null references public.itens (id),
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade integer not null,
  estoque_apos integer not null,
  motivo text,
  venda_id bigint references public.vendas (id)
);

create index venda_itens_venda_idx on public.venda_itens (venda_id);
create index movimentos_item_idx on public.movimentos_estoque (item_id);
create index vendas_criado_em_idx on public.vendas (criado_em);

-- RLS sem policies: anon/authenticated não leem nada
alter table public.itens enable row level security;
alter table public.clientes enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.movimentos_estoque enable row level security;

-- Entrada de estoque
create or replace function public.registrar_entrada(
  p_codigo text, p_quantidade int, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item public.itens%rowtype;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero';
  end if;

  select * into v_item from public.itens
   where codigo = upper(trim(p_codigo)) for update;
  if not found then
    raise exception 'Item % não encontrado', upper(trim(p_codigo));
  end if;

  update public.itens set estoque = estoque + p_quantidade
   where id = v_item.id returning * into v_item;

  insert into public.movimentos_estoque (item_id, tipo, quantidade, estoque_apos, motivo)
  values (v_item.id, 'entrada', p_quantidade, v_item.estoque, p_motivo);

  return jsonb_build_object('codigo', v_item.codigo, 'nome', v_item.nome,
    'estoque', v_item.estoque, 'estoque_minimo', v_item.estoque_minimo);
end $$;

-- Ajuste (contagem): define o novo estoque e grava o delta
create or replace function public.ajustar_estoque(
  p_codigo text, p_novo_estoque int, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item public.itens%rowtype;
  v_delta int;
begin
  if p_novo_estoque is null or p_novo_estoque < 0 then
    raise exception 'Novo estoque não pode ser negativo';
  end if;

  select * into v_item from public.itens
   where codigo = upper(trim(p_codigo)) for update;
  if not found then
    raise exception 'Item % não encontrado', upper(trim(p_codigo));
  end if;

  v_delta := p_novo_estoque - v_item.estoque;
  update public.itens set estoque = p_novo_estoque
   where id = v_item.id returning * into v_item;

  insert into public.movimentos_estoque (item_id, tipo, quantidade, estoque_apos, motivo)
  values (v_item.id, 'ajuste', v_delta, v_item.estoque, p_motivo);

  return jsonb_build_object('codigo', v_item.codigo, 'nome', v_item.nome,
    'estoque', v_item.estoque, 'estoque_minimo', v_item.estoque_minimo);
end $$;

-- Venda atômica: valida, trava itens, baixa estoque, grava movimentos
create or replace function public.registrar_venda(
  p_cliente_id bigint, p_forma text, p_itens jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_venda_id bigint;
  v_total numeric(12,2) := 0;
  v_sub numeric(12,2);
  v_novo int;
  v_falta text;
  r record;
  v_itens jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
begin
  if p_forma is null or p_forma not in ('dinheiro','pix','cartao','fiado') then
    raise exception 'Forma de pagamento inválida: %', coalesce(p_forma, '(vazia)');
  end if;
  if p_forma = 'fiado' and p_cliente_id is null then
    raise exception 'Venda fiado exige cliente';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter ao menos um item';
  end if;

  -- cada linha precisa de codigo e quantidade inteira > 0
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
     where coalesce(trim(e->>'codigo'), '') = ''
        or (e->>'quantidade') is null
        or (e->>'quantidade') !~ '^[0-9]+$'
        or (e->>'quantidade')::int <= 0
  ) then
    raise exception 'Itens inválidos: informe codigo e quantidade maior que zero';
  end if;

  -- itens inexistentes
  select a.codigo into v_falta
    from (select distinct upper(trim(e->>'codigo')) as codigo
            from jsonb_array_elements(p_itens) e) a
    left join public.itens i on i.codigo = a.codigo
   where i.id is null
   order by a.codigo limit 1;
  if v_falta is not null then
    raise exception 'Item % não encontrado', v_falta;
  end if;

  insert into public.vendas (cliente_id, forma_pagamento, total)
  values (p_cliente_id, p_forma, 0) returning id into v_venda_id;

  -- codigos repetidos somados; linhas travadas em ordem de id (evita deadlock)
  for r in
    select i.id, i.codigo, i.nome, i.preco, i.estoque, i.estoque_minimo, a.qtd
      from (select upper(trim(e->>'codigo')) as codigo,
                   sum((e->>'quantidade')::int) as qtd
              from jsonb_array_elements(p_itens) e group by 1) a
      join public.itens i on i.codigo = a.codigo
     order by i.id
       for update of i
  loop
    if r.estoque < r.qtd then
      raise exception 'Estoque insuficiente para %: disponível %, pedido %',
        r.codigo, r.estoque, r.qtd;
    end if;

    v_novo := r.estoque - r.qtd;
    v_sub := round(r.preco * r.qtd, 2);
    v_total := v_total + v_sub;

    update public.itens set estoque = v_novo where id = r.id;

    insert into public.venda_itens (venda_id, item_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, r.id, r.qtd, r.preco, v_sub);

    insert into public.movimentos_estoque
      (item_id, tipo, quantidade, estoque_apos, motivo, venda_id)
    values (r.id, 'saida', -r.qtd, v_novo, 'venda #' || v_venda_id, v_venda_id);

    v_itens := v_itens || jsonb_build_object(
      'codigo', r.codigo, 'nome', r.nome, 'quantidade', r.qtd,
      'preco_unitario', r.preco, 'subtotal', v_sub, 'estoque_apos', v_novo);

    if v_novo <= r.estoque_minimo then
      v_alertas := v_alertas || jsonb_build_object(
        'codigo', r.codigo, 'nome', r.nome,
        'estoque', v_novo, 'estoque_minimo', r.estoque_minimo);
    end if;
  end loop;

  update public.vendas set total = v_total where id = v_venda_id;

  return jsonb_build_object('venda_id', v_venda_id, 'total', v_total,
    'itens', v_itens, 'alertas', v_alertas);
end $$;

-- Só a service_role executa as funções
revoke execute on function public.registrar_entrada(text, int, text) from public, anon, authenticated;
revoke execute on function public.ajustar_estoque(text, int, text) from public, anon, authenticated;
revoke execute on function public.registrar_venda(bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_entrada(text, int, text) to service_role;
grant execute on function public.ajustar_estoque(text, int, text) to service_role;
grant execute on function public.registrar_venda(bigint, text, jsonb) to service_role;
