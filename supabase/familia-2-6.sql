-- Casita Stock 2.6 — Fotos de la familia, invitaciones con aprobación (QR y código),
-- quitar o bloquear miembros, y arreglos de seguridad.
-- Pega TODO en Supabase → SQL Editor → New query → Run (arriba debe decir "Database", no "Logs").
-- Se puede correr más de una vez. No borra productos, compras, recuerdos, actividad ni miembros.

-- ---------- 1. Foto de cada miembro ----------
alter table public.miembros add column if not exists foto text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'miembros_foto_tamano') then
    alter table public.miembros add constraint miembros_foto_tamano
      check (foto is null or (char_length(foto) <= 60000 and foto like 'data:image/%'));
  end if;
end $$;

-- ---------- 2. Enlace de invitación (para el QR): clave larga y aleatoria, sin datos personales ----------
alter table public.hogares add column if not exists invitacion text;
alter table public.hogares alter column invitacion set default replace(gen_random_uuid()::text, '-', '');
update public.hogares set invitacion = replace(gen_random_uuid()::text, '-', '') where invitacion is null;
create unique index if not exists hogares_invitacion on public.hogares (invitacion);

-- Toda casa debe tener administrador: si alguna no tiene, lo es quien la creó (si sigue en ella)
update public.miembros m set rol = 'dueño'
  from public.hogares h
  where m.hogar_id = h.id and m.user_id = h.creado_por
    and not exists (select 1 from public.miembros x where x.hogar_id = h.id and x.rol = 'dueño');

create or replace function public.es_admin(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where hogar_id = h and user_id = auth.uid() and rol = 'dueño');
$$;

-- ---------- 3. Seguridad: cada persona solo cambia su nombre y su foto; el hogar, solo su nombre ----------
-- (Antes un miembro podía cambiar su propio rol o el código de la casa desde fuera de la app.)
revoke update on public.miembros from anon, authenticated;
grant update (nombre, foto) on public.miembros to authenticated;
revoke update on public.hogares from anon, authenticated;
grant update (nombre) on public.hogares to authenticated;

-- ---------- 4. Solicitudes para unirse y bloqueos ----------
create table if not exists public.solicitudes (
  id           uuid primary key default gen_random_uuid(),
  hogar_id     uuid not null references public.hogares(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nombre       text not null default '' check (char_length(nombre) <= 60),
  correo       text not null default '' check (char_length(correo) <= 80),
  via          text not null default 'codigo' check (via in ('qr', 'codigo')),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  creado       timestamptz not null default now(),
  resuelto     timestamptz,
  resuelto_por uuid
);
create unique index if not exists solicitudes_una_pendiente on public.solicitudes (hogar_id, user_id) where estado = 'pendiente';
create index if not exists solicitudes_hogar on public.solicitudes (hogar_id, estado, creado desc);
create index if not exists solicitudes_usuario on public.solicitudes (user_id, creado desc);
alter table public.solicitudes enable row level security;
drop policy if exists "ver solicitudes" on public.solicitudes;
create policy "ver solicitudes" on public.solicitudes for select using (user_id = auth.uid() or public.es_admin(hogar_id));
-- Sin reglas de insert/update/delete: solo se cambian con las funciones de abajo, que validan todo.

create table if not exists public.bloqueos (
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  nombre   text not null default '',
  creado   timestamptz not null default now(),
  por      uuid,
  primary key (hogar_id, user_id)
);
alter table public.bloqueos enable row level security;
drop policy if exists "ver bloqueos" on public.bloqueos;
create policy "ver bloqueos" on public.bloqueos for select using (public.es_admin(hogar_id));

-- Busca la casa por código (6 letras) o por enlace del QR
create or replace function public.casa_por_clave(clave text)
returns public.hogares language sql stable security definer set search_path = public as $$
  select * from public.hogares
  where codigo = upper(trim(coalesce(clave, ''))) or invitacion = lower(trim(coalesce(clave, '')))
  limit 1;
$$;
revoke all on function public.casa_por_clave(text) from public, anon, authenticated;

-- Lo que ve quien abre una invitación: solo el nombre de la casa y su propio estado
create or replace function public.ver_invitacion(clave text)
returns json language plpgsql stable security definer set search_path = public as $$
declare h public.hogares; e text := 'nueva';
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  h := public.casa_por_clave(clave);
  if h.id is null then raise exception 'Esa invitación ya no sirve. Pide el código o el QR nuevo.'; end if;
  if exists (select 1 from public.miembros where hogar_id = h.id and user_id = auth.uid()) then e := 'miembro';
  elsif exists (select 1 from public.solicitudes where hogar_id = h.id and user_id = auth.uid() and estado = 'pendiente') then e := 'pendiente';
  end if;
  return json_build_object('casa', h.nombre, 'estado', e);
end $$;

create or replace function public.solicitar_unirme(clave text, mi_nombre text)
returns json language plpgsql security definer set search_path = public as $$
declare h public.hogares; s public.solicitudes; mail text; v text;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  h := public.casa_por_clave(clave);
  if h.id is null then raise exception 'Esa invitación ya no sirve. Pide el código o el QR nuevo.'; end if;
  if exists (select 1 from public.miembros where hogar_id = h.id and user_id = auth.uid()) then
    return json_build_object('estado', 'miembro', 'casa', h.nombre);
  end if;
  if exists (select 1 from public.bloqueos where hogar_id = h.id and user_id = auth.uid()) then
    raise exception 'No es posible unirte a esta casa. Habla con quien te invitó.';
  end if;
  select * into s from public.solicitudes where hogar_id = h.id and user_id = auth.uid() and estado = 'pendiente';
  if s.id is not null then
    update public.solicitudes set nombre = left(coalesce(nullif(trim(mi_nombre), ''), nombre), 60) where id = s.id;
    return json_build_object('estado', 'pendiente', 'casa', h.nombre, 'id', s.id);
  end if;
  if (select count(*) from public.solicitudes where user_id = auth.uid() and estado = 'pendiente') >= 3 then
    raise exception 'Ya tienes varias solicitudes esperando. Espera a que te respondan.';
  end if;
  if (select count(*) from public.solicitudes where hogar_id = h.id and estado = 'pendiente') >= 20 then
    raise exception 'Esta casa tiene muchas solicitudes esperando. Inténtalo más tarde.';
  end if;
  select email into mail from auth.users where id = auth.uid();
  mail := coalesce(mail, '');
  if position('@' in mail) > 0 then
    mail := left(split_part(mail, '@', 1), 2) || '•••@' || split_part(mail, '@', 2);
  end if;
  v := case when h.invitacion = lower(trim(clave)) then 'qr' else 'codigo' end;
  insert into public.solicitudes (hogar_id, user_id, nombre, correo, via)
    values (h.id, auth.uid(), left(coalesce(trim(mi_nombre), ''), 60), left(mail, 80), v) returning * into s;
  return json_build_object('estado', 'pendiente', 'casa', h.nombre, 'id', s.id);
end $$;

-- La última solicitud de quien la hizo (para la pantalla "Esperando aprobación")
create or replace function public.mi_solicitud()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('id', s.id, 'estado', s.estado, 'casa', h.nombre, 'creado', s.creado)
  from public.solicitudes s join public.hogares h on h.id = s.hogar_id
  where s.user_id = auth.uid() and s.creado > now() - interval '30 days'
  order by s.creado desc limit 1;
$$;

create or replace function public.cancelar_solicitud()
returns void language sql security definer set search_path = public as $$
  update public.solicitudes set estado = 'cancelada', resuelto = now()
  where user_id = auth.uid() and estado = 'pendiente';
$$;

create or replace function public.responder_solicitud(sol uuid, aprobar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitudes;
begin
  select * into s from public.solicitudes where id = sol for update;
  if s.id is null or not public.es_admin(s.hogar_id) then raise exception 'Solo quien administra la casa puede responder'; end if;
  if s.estado <> 'pendiente' then return; end if;
  if aprobar then
    if exists (select 1 from public.bloqueos where hogar_id = s.hogar_id and user_id = s.user_id) then
      raise exception 'Esa persona está bloqueada. Desbloquéala primero.';
    end if;
    insert into public.miembros (hogar_id, user_id, nombre, rol) values (s.hogar_id, s.user_id, s.nombre, 'miembro')
      on conflict (hogar_id, user_id) do nothing;
  end if;
  update public.solicitudes set estado = case when aprobar then 'aprobada' else 'rechazada' end, resuelto = now(), resuelto_por = auth.uid()
    where id = s.id;
end $$;

create or replace function public.quitar_miembro(h uuid, quien uuid, bloquear boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.miembros;
begin
  if not public.es_admin(h) then raise exception 'Solo quien administra la casa puede quitar miembros'; end if;
  if quien = auth.uid() then raise exception 'No puedes quitarte a ti mismo'; end if;
  select * into m from public.miembros where hogar_id = h and user_id = quien;
  if m.user_id is not null and m.rol = 'dueño' then raise exception 'No se puede quitar a quien administra la casa'; end if;
  delete from public.miembros where hogar_id = h and user_id = quien;
  update public.solicitudes set estado = 'cancelada', resuelto = now(), resuelto_por = auth.uid()
    where hogar_id = h and user_id = quien and estado = 'pendiente';
  if bloquear then
    insert into public.bloqueos (hogar_id, user_id, nombre, por) values (h, quien, coalesce(m.nombre, ''), auth.uid())
      on conflict (hogar_id, user_id) do nothing;
  end if;
end $$;

create or replace function public.desbloquear(h uuid, quien uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin(h) then raise exception 'Solo quien administra la casa puede desbloquear'; end if;
  delete from public.bloqueos where hogar_id = h and user_id = quien;
end $$;

-- Cambiar el código: ahora solo el administrador, y también cambia el enlace del QR
create or replace function public.nuevo_codigo(h uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.es_admin(h) then raise exception 'Solo quien administra la casa puede cambiar el código'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  update public.hogares set codigo = c, invitacion = replace(gen_random_uuid()::text, '-', '') where id = h;
  return c;
end $$;

-- La función anterior (apps de versiones viejas): ya no deja entrar directo, solo envía la solicitud
create or replace function public.unirse_hogar(codigo_invitacion text, mi_nombre text)
returns public.hogares language plpgsql security definer set search_path = public as $$
declare r json; h public.hogares;
begin
  r := public.solicitar_unirme(codigo_invitacion, mi_nombre);
  if r->>'estado' = 'miembro' then h := public.casa_por_clave(codigo_invitacion); return h; end if;
  raise exception 'Tu solicitud fue enviada. Entrarás cuando quien administra la casa la apruebe (actualiza la app).';
end $$;

revoke all on function public.ver_invitacion(text) from public, anon;
revoke all on function public.solicitar_unirme(text, text) from public, anon;
revoke all on function public.mi_solicitud() from public, anon;
revoke all on function public.cancelar_solicitud() from public, anon;
revoke all on function public.responder_solicitud(uuid, boolean) from public, anon;
revoke all on function public.quitar_miembro(uuid, uuid, boolean) from public, anon;
revoke all on function public.desbloquear(uuid, uuid) from public, anon;
revoke all on function public.nuevo_codigo(uuid) from public, anon;
revoke all on function public.unirse_hogar(text, text) from public, anon;
grant execute on function public.ver_invitacion(text) to authenticated;
grant execute on function public.solicitar_unirme(text, text) to authenticated;
grant execute on function public.mi_solicitud() to authenticated;
grant execute on function public.cancelar_solicitud() to authenticated;
grant execute on function public.responder_solicitud(uuid, boolean) to authenticated;
grant execute on function public.quitar_miembro(uuid, uuid, boolean) to authenticated;
grant execute on function public.desbloquear(uuid, uuid) to authenticated;
grant execute on function public.nuevo_codigo(uuid) to authenticated;
grant execute on function public.unirse_hogar(text, text) to authenticated;

-- Tiempo real: el administrador recibe las solicitudes al instante; quien pidió ve la respuesta al instante
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'solicitudes') then
    alter publication supabase_realtime add table public.solicitudes;
  end if;
end $$;

-- Verificación: debe mostrar 1 fila con todo en true
select
  exists (select 1 from information_schema.columns where table_name = 'miembros' and column_name = 'foto') as fotos,
  exists (select 1 from information_schema.tables where table_name = 'solicitudes') as solicitudes,
  exists (select 1 from information_schema.tables where table_name = 'bloqueos') as bloqueos,
  not exists (select 1 from public.hogares where invitacion is null) as enlaces,
  not exists (select 1 from public.hogares h where not exists (select 1 from public.miembros m where m.hogar_id = h.id and m.rol = 'dueño')) as administradores;
