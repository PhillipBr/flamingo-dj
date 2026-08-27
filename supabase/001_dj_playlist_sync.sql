create table if not exists public.dj_playlist_sync (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    flamingo_playlist_id text not null,
    flamingo_playlist_name text not null,

    spotify_playlist_id text,
    spotify_playlist_name text,

    track_ids jsonb not null
        default '[]'::jsonb,

    last_direction text,

    last_synced_at timestamptz
        not null
        default now(),

    created_at timestamptz
        not null
        default now(),

    updated_at timestamptz
        not null
        default now(),

    constraint dj_playlist_sync_user_playlist_unique
        unique (
            user_id,
            flamingo_playlist_id
        )
);

alter table public.dj_playlist_sync
    enable row level security;

drop policy if exists
    "dj_playlist_sync_select_own"
on public.dj_playlist_sync;

create policy
    "dj_playlist_sync_select_own"
on public.dj_playlist_sync
for select
to authenticated
using (
    auth.uid() = user_id
);

drop policy if exists
    "dj_playlist_sync_insert_own"
on public.dj_playlist_sync;

create policy
    "dj_playlist_sync_insert_own"
on public.dj_playlist_sync
for insert
to authenticated
with check (
    auth.uid() = user_id
);

drop policy if exists
    "dj_playlist_sync_update_own"
on public.dj_playlist_sync;

create policy
    "dj_playlist_sync_update_own"
on public.dj_playlist_sync
for update
to authenticated
using (
    auth.uid() = user_id
)
with check (
    auth.uid() = user_id
);

drop policy if exists
    "dj_playlist_sync_delete_own"
on public.dj_playlist_sync;

create policy
    "dj_playlist_sync_delete_own"
on public.dj_playlist_sync
for delete
to authenticated
using (
    auth.uid() = user_id
);
