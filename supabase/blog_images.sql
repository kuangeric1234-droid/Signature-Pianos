-- =============================================================================
-- Signature Pianos — blog cover images
--
--   * blog-images storage bucket (public read): covers uploaded from the
--     admin post editor. Admins upload, list and delete.
--   * A published post must have a cover image. NOT VALID so posts already
--     live without one stay up; validated at the end, once every live post
--     has a cover (all do as of 28 Sep 2026).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin manage blog images" on storage.objects;
create policy "Admin manage blog images"
on storage.objects for all
to authenticated
using (bucket_id = 'blog-images' and is_admin())
with check (bucket_id = 'blog-images' and is_admin());

alter table blog_posts drop constraint if exists blog_posts_published_needs_image;
alter table blog_posts add constraint blog_posts_published_needs_image
  check (status <> 'published' or coalesce(btrim(hero_image_url), '') <> '') not valid;

-- Every live post has a cover now, so the rule covers existing rows too.
alter table blog_posts validate constraint blog_posts_published_needs_image;
