-- 📌 Tab pou tout mesaj k ap vini nan WhatsApp
create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    from_number text not null,
    body text,
    media_url text,
    timestamp timestamptz default now(),
    status text default 'received'
);

-- 📌 Tab pou tout repons bot la
create table if not exists replies (
    id uuid primary key default gen_random_uuid(),
    to_number text not null,
    body text,
    media_url text,
    timestamp timestamptz default now(),
    status text default 'sent'
);

-- 📌 Tab pou swiv konvèsasyon
create table if not exists conversations (
    id uuid primary key default gen_random_uuid(),
    user_number text not null,
    started_at timestamptz default now(),
    ended_at timestamptz,
    messages jsonb
);

-- 📌 Bucket pou fichye medya yo
insert into storage.buckets (id, name, public) 
values ('media', 'media', true)
on conflict do nothing;
