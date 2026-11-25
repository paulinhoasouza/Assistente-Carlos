-- Dados de demonstração. Roda só uma vez: se já houver itens, não faz nada.
do $$
begin
  if exists (select 1 from public.itens) then
    raise notice 'Já existem itens; seed ignorado.';
    return;
  end if;

  insert into public.itens (codigo, nome, unidade, preco, custo, estoque_minimo) values
    ('CAM01', 'Camiseta preta básica', 'un', 49.90, 22.00, 5),
    ('CAM02', 'Camiseta branca básica', 'un', 49.90, 22.00, 5),
    ('BON01', 'Boné aba curva', 'un', 59.90, 25.00, 3),
    ('MOL01', 'Moletom canguru cinza', 'un', 149.90, 70.00, 2),
    ('MEI01', 'Meia cano médio (par)', 'par', 14.90, 5.00, 10),
    ('CAN01', 'Caneca personalizada 300ml', 'un', 34.90, 12.00, 4),
    ('ADE01', 'Adesivo vinil', 'un', 5.00, 1.20, 20),
    ('ECO01', 'Ecobag algodão', 'un', 29.90, 11.00, 3);

  -- Estoque inicial passa pela função, para ficar registrado no histórico.
  perform public.registrar_entrada('CAM01', 30, 'estoque inicial (demo)');
  perform public.registrar_entrada('CAM02', 25, 'estoque inicial (demo)');
  perform public.registrar_entrada('BON01', 12, 'estoque inicial (demo)');
  perform public.registrar_entrada('MOL01', 6,  'estoque inicial (demo)');
  perform public.registrar_entrada('MEI01', 40, 'estoque inicial (demo)');
  perform public.registrar_entrada('CAN01', 15, 'estoque inicial (demo)');
  perform public.registrar_entrada('ADE01', 100,'estoque inicial (demo)');
  perform public.registrar_entrada('ECO01', 4,  'estoque inicial (demo)');

  insert into public.clientes (nome, telefone, obs) values
    ('Maria Silva', '11999990001', 'cliente desde 2024'),
    ('João Pereira', '11999990002', null),
    ('Ana Costa', '11999990003', 'compra no fiado, paga todo dia 10');

  -- Duas vendas de exemplo (baixam o estoque de verdade).
  perform public.registrar_venda(
    (select id from public.clientes where nome = 'Maria Silva'), 'pix',
    '[{"codigo":"CAM01","quantidade":2},{"codigo":"BON01","quantidade":1}]'::jsonb);
  perform public.registrar_venda(
    (select id from public.clientes where nome = 'Ana Costa'), 'fiado',
    '[{"codigo":"ECO01","quantidade":2},{"codigo":"ADE01","quantidade":5}]'::jsonb);
end $$;
