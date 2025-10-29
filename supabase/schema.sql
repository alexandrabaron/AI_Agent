-- Basic schema for anonymous session-scoped chat and file metadata.
-- Phase 1: permissive access to simplify prototyping. Tighten in Phase 2 with Auth.

create extension if not exists "uuid-ossp";

-- Session table (optional); client keeps sessionId in localStorage.
create table if not exists public.chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null unique,
  created_at timestamp with time zone default now()
);

-- Chat messages associated with a session.
create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null,
  role text not null check (role in ('user','agent')),
  message text not null,
  payload jsonb,
  created_at timestamp with time zone default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at);

-- File metadata for uploaded datasets (actual blobs in Storage bucket `uploads`).
create table if not exists public.files (
  id uuid primary key default uuid_generate_v4(),
  session_id text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamp with time zone default now()
);
create index if not exists files_session_idx on public.files(session_id, created_at);

-- Phase 1 RLS: disabled (simpler). Phase 2: enable RLS and add policies per user/session.
alter table public.chat_sessions disable row level security;
alter table public.chat_messages disable row level security;
alter table public.files disable row level security;

-- Optional helper view: latest N messages per session
create or replace view public.chat_history as
select session_id, json_agg(json_build_object(
  'id', id,
  'role', role,
  'message', message,
  'payload', payload,
  'created_at', created_at
) order by created_at asc) as messages
from public.chat_messages
group by session_id;

-- Notes:
-- * Create Storage bucket `uploads` manually in Supabase dashboard.
-- * For public access to charts/images, you can create signed URLs from server (n8n) and return to the UI.
-- * Phase 2: introduce Supabase Auth and RLS, replacing session_id with auth.uid() linkage.


