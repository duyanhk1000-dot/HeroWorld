-- 003_storage.sql — Supabase Storage buckets (run after 002_rls.sql)
-- Art lives in Storage; the Godot client loads portraits/audio by public or
-- signed URL. The game server never uploads art — it only mints signed URLs.
-- Uploads happen from the asset pipeline (a human / CI with the service key).

-- Portraits: public read (game art), no public write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portraits', 'portraits', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Audio (attack/skill/UI/BGM WAVs): public read, no public write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 10485760, array['audio/wav', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do nothing;

-- Storage RLS: public read is granted by the bucket being public.
-- Writes require the service role key (no storage.objects policy for anon
-- or authenticated users is created here, so client uploads are denied).
--
-- Naming convention (must match data/units.json visual.portrait_url):
--   portraits/<unit_id>.png        e.g. portraits/vn_yet_kieu.png
--   audio/attacks/<unit_id>_attack.wav
--   audio/skills/<skill_id>.wav
--   audio/ui/<name>.wav            e.g. audio/ui/shop_buy.wav
--   audio/bgm/<name>.wav           e.g. audio/bgm/bgm_battle.wav
