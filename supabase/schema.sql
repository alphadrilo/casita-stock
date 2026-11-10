-- Casita Stock: esquema de base de datos para Supabase
-- Pégalo completo en Supabase > SQL Editor > New query y toca "Run". Se puede ejecutar más de una vez.
--
-- Modelo: cada familia es un "hogar". Las personas se unen a un hogar con un código de invitación.
-- Todo el inventario se guarda en "documentos" (colección + id + datos JSON), igual que la versión anterior,
-- y solo los miembros del hogar pueden leerlo o cambiarlo.

-- ---------- Tablas ----------
create table if not exists public.hogares (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default 'Mi casa',
  codigo      text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  creado_por  uuid references auth.users(id) on delete set null,
  creado      timestamptz not null default now()
);

create table if not exists public.miembros (
  hogar_id  uuid not null references public.hogares(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nombre    text not null default '',
  rol       text not null default 'miembro' check (rol in ('dueño', 'miembro')),
  unido     timestamptz not null default now(),
  primary key (hogar_id, user_id)
);

create table if not exists public.documentos (
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  coleccion    text not null check (coleccion in ('productos', 'lista', 'ajustes')),
  id           text not null check (char_length(id) between 1 and 200),
  data         jsonb not null,
  actualizado  timestamptz not null default now(),
  primary key (hogar_id, coleccion, id)
);
create index if not exists documentos_hogar_col on public.documentos (hogar_id, coleccion);

-- Para que el tiempo real avise también de los borrados con todos sus datos
alter table public.documentos replica identity full;

-- ---------- Reglas de acceso (Row Level Security) ----------
alter table public.hogares    enable row level security;
alter table public.miembros   enable row level security;
alter table public.documentos enable row level security;

create or replace function public.es_miembro(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where hogar_id = h and user_id = auth.uid());
$$;

drop policy if exists "ver mi hogar" on public.hogares;
create policy "ver mi hogar" on public.hogares for select using (public.es_miembro(id));
drop policy if exists "renombrar mi hogar" on public.hogares;
create policy "renombrar mi hogar" on public.hogares for update using (public.es_miembro(id)) with check (public.es_miembro(id));

drop policy if exists "ver mi familia" on public.miembros;
create policy "ver mi familia" on public.miembros for select using (public.es_miembro(hogar_id));
drop policy if exists "cambiar mi nombre" on public.miembros;
create policy "cambiar mi nombre" on public.miembros for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "salir del hogar" on public.miembros;
create policy "salir del hogar" on public.miembros for delete using (user_id = auth.uid());

drop policy if exists "leer inventario" on public.documentos;
create policy "leer inventario" on public.documentos for select using (public.es_miembro(hogar_id));
drop policy if exists "agregar al inventario" on public.documentos;
create policy "agregar al inventario" on public.documentos for insert with check (public.es_miembro(hogar_id));
drop policy if exists "cambiar inventario" on public.documentos;
create policy "cambiar inventario" on public.documentos for update using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));
drop policy if exists "borrar del inventario" on public.documentos;
create policy "borrar del inventario" on public.documentos for delete using (public.es_miembro(hogar_id));

-- ---------- Funciones para crear un hogar o unirse con un código ----------
create or replace function public.crear_hogar(nombre_hogar text, mi_nombre text)
returns public.hogares language plpgsql security definer set search_path = public as $$
declare h public.hogares;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into public.hogares (nombre, creado_por) values (coalesce(nullif(trim(nombre_hogar), ''), 'Mi casa'), auth.uid()) returning * into h;
  insert into public.miembros (hogar_id, user_id, nombre, rol) values (h.id, auth.uid(), coalesce(trim(mi_nombre), ''), 'dueño');
  return h;
end $$;

create or replace function public.unirse_hogar(codigo_invitacion text, mi_nombre text)
returns public.hogares language plpgsql security definer set search_path = public as $$
declare h public.hogares;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into h from public.hogares where codigo = upper(trim(codigo_invitacion));
  if h.id is null then raise exception 'Ese código no existe. Revisa las letras y números.'; end if;
  insert into public.miembros (hogar_id, user_id, nombre) values (h.id, auth.uid(), coalesce(trim(mi_nombre), ''))
    on conflict (hogar_id, user_id) do update set nombre = excluded.nombre;
  return h;
end $$;

-- Cambia el código de invitación (por ejemplo si se compartió con alguien que no debía)
create or replace function public.nuevo_codigo(h uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.es_miembro(h) then raise exception 'No perteneces a este hogar'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  update public.hogares set codigo = c where id = h;
  return c;
end $$;

revoke all on function public.crear_hogar(text, text) from public, anon;
revoke all on function public.unirse_hogar(text, text) from public, anon;
revoke all on function public.nuevo_codigo(uuid) from public, anon;
grant execute on function public.crear_hogar(text, text) to authenticated;
grant execute on function public.unirse_hogar(text, text) to authenticated;
grant execute on function public.nuevo_codigo(uuid) to authenticated;

-- ---------- Tiempo real: que todos en casa vean los cambios al instante ----------
do $$ begin
  alter publication supabase_realtime add table public.documentos;
exception when duplicate_object then null; when undefined_object then null;
end $$;
