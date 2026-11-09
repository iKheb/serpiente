-- ============================================================================
-- Reparo · Sincronización en la nube (Supabase)
-- Pega TODO este script en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin problema.
-- ============================================================================

-- Contador global de cambios (cada fila guardada recibe un número creciente).
create sequence if not exists public.reparo_seq;

-- Una sola tabla para todos los registros de la app (clientes, gastos,
-- inventario, movimientos, actividad y datos del negocio), separados por cuenta.
create table if not exists public.reparo_rows (
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text   not null,
  id         text   not null,
  data       jsonb  not null,
  updated_at bigint not null,
  device_id  text,
  seq        bigint not null default nextval('public.reparo_seq'),
  primary key (user_id, tbl, id)
);

create index if not exists reparo_rows_user_seq on public.reparo_rows (user_id, seq);

-- Cada alta o cambio recibe un número de secuencia nuevo (para descargar sólo lo nuevo).
create or replace function public.reparo_set_seq()
returns trigger
language plpgsql
as $$
begin
  new.seq := nextval('public.reparo_seq');
  return new;
end
$$;

drop trigger if exists reparo_rows_seq on public.reparo_rows;
create trigger reparo_rows_seq
  before insert or update on public.reparo_rows
  for each row execute function public.reparo_set_seq();

-- Seguridad: cada cuenta sólo puede ver y modificar sus propios datos.
alter table public.reparo_rows enable row level security;

drop policy if exists "reparo_select_own" on public.reparo_rows;
drop policy if exists "reparo_insert_own" on public.reparo_rows;
drop policy if exists "reparo_update_own" on public.reparo_rows;
drop policy if exists "reparo_delete_own" on public.reparo_rows;

create policy "reparo_select_own" on public.reparo_rows
  for select to authenticated using (auth.uid() = user_id);
create policy "reparo_insert_own" on public.reparo_rows
  for insert to authenticated with check (auth.uid() = user_id);
create policy "reparo_update_own" on public.reparo_rows
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reparo_delete_own" on public.reparo_rows
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.reparo_rows from anon;
grant select, insert, update, delete on public.reparo_rows to authenticated;
grant usage on sequence public.reparo_seq to authenticated;

-- Subida de cambios en lote.
--   rows: [{ "tbl": "clients", "id": "...", "data": {...}, "updated_at": 1731000000000, "device_id": "..." }, ...]
--   · clients / expenses / inventory / settings: gana el cambio más reciente (updated_at).
--   · movements / audit: sólo se agregan (nunca se modifican).
-- Devuelve el número de secuencia más alto de la cuenta.
create or replace function public.reparo_push(rows jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  max_seq bigint;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;

  for r in select value from jsonb_array_elements(rows) loop
    if (r ->> 'tbl') in ('movements', 'audit') then
      insert into public.reparo_rows (user_id, tbl, id, data, updated_at, device_id)
      values (auth.uid(), r ->> 'tbl', r ->> 'id', r -> 'data', (r ->> 'updated_at')::bigint, r ->> 'device_id')
      on conflict (user_id, tbl, id) do nothing;
    else
      insert into public.reparo_rows (user_id, tbl, id, data, updated_at, device_id)
      values (auth.uid(), r ->> 'tbl', r ->> 'id', r -> 'data', (r ->> 'updated_at')::bigint, r ->> 'device_id')
      on conflict (user_id, tbl, id) do update
        set data = excluded.data,
            updated_at = excluded.updated_at,
            device_id = excluded.device_id
        where public.reparo_rows.updated_at <= excluded.updated_at;
    end if;
  end loop;

  select coalesce(max(seq), 0) into max_seq from public.reparo_rows where user_id = auth.uid();
  return max_seq;
end
$$;

revoke all on function public.reparo_push(jsonb) from public, anon;
grant execute on function public.reparo_push(jsonb) to authenticated;
