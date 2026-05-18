/* Signature Pianos — Uploader
   Uppy (Dashboard + Tus) streaming resumable uploads directly into
   Supabase Storage. Built for the driver pickup / delivery photo flow:
   the resulting public URLs feed into deliveries.pickup_photos and
   deliveries.delivery_photos (see supabase/schema.sql).

   Wire diagram:
     Browser  -- Tus resumable PATCH/POST -->  Supabase Storage
              <-- 200 + Location header --

   The Tus endpoint and required headers are defined here:
     https://supabase.com/docs/guides/storage/uploads/resumable-uploads

   Requires from _includes/scripts.html:
     - window.SP_CONFIG.supabaseUrl + .supabaseAnonKey
     - The Uppy CDN bundle (window.Uppy with .Uppy / .Dashboard / .Tus)
     - SPAuth (so we can attach the user's bearer token when present) */

(function (root) {
  'use strict';

  const cfg = root.SP_CONFIG || {};
  const TUS_CHUNK_SIZE = 6 * 1024 * 1024; /* Supabase requires 6 MB chunks */

  function ensureUppy() {
    if (!root.Uppy || typeof root.Uppy.Uppy !== 'function' || !root.Uppy.Dashboard || !root.Uppy.Tus) {
      console.warn('[SP/uploader] Uppy bundle not loaded — expected window.Uppy.{Uppy,Dashboard,Tus}');
      return false;
    }
    return true;
  }

  /* Create a Dashboard uploader that streams files into Supabase Storage.
     opts:
       target       — CSS selector or element the Dashboard mounts into
       bucket       — Storage bucket name (default 'driver-photos')
       pathPrefix   — optional folder prefix within the bucket
                      (e.g. `deliveries/<orderId>/pickup`)
       accept       — allowed mime types (default ['image/*'])
       maxFiles     — max file count (default 6)
       note         — Dashboard helper text
       height       — Dashboard pixel height
       onComplete   — fn(urls, result) — urls is [{ name, path, publicUrl }]
   */
  async function createUploader(opts) {
    if (!ensureUppy()) return null;
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.warn('[SP/uploader] SP_CONFIG.supabaseUrl/anonKey missing');
      return null;
    }

    const session = root.SPAuth ? await root.SPAuth.getSession() : null;
    const accessToken = (session && session.access_token) || cfg.supabaseAnonKey;
    const bucket = opts.bucket || 'driver-photos';
    const pathPrefix = (opts.pathPrefix || '').replace(/^\/+|\/+$/g, '');

    const uppy = new root.Uppy.Uppy({
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: opts.maxFiles || 6,
        allowedFileTypes: opts.accept || ['image/*'],
      },
    });

    uppy.use(root.Uppy.Dashboard, {
      inline: true,
      target: opts.target,
      proudlyDisplayPoweredByUppy: false,
      height: opts.height || 380,
      theme: 'dark',
      note: opts.note || 'Up to 6 photos — JPEG or PNG',
    });

    uppy.use(root.Uppy.Tus, {
      endpoint: `${cfg.supabaseUrl}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: cfg.supabaseAnonKey,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      allowedMetaFields: ['bucketName', 'objectName', 'contentType', 'cacheControl'],
    });

    /* Supabase Storage reads bucketName + objectName from the Tus metadata.
       Stamp them on the file when it's added so each upload is correctly routed. */
    uppy.on('file-added', (file) => {
      const stamp = Date.now();
      const safe = file.name.replace(/[^a-z0-9._-]/gi, '_');
      const objectName = pathPrefix ? `${pathPrefix}/${stamp}-${safe}` : `${stamp}-${safe}`;
      file.meta = {
        ...file.meta,
        bucketName: bucket,
        objectName,
        contentType: file.type,
        cacheControl: '3600',
      };
    });

    if (typeof opts.onComplete === 'function') {
      uppy.on('complete', (result) => {
        const urls = (result.successful || []).map((f) => ({
          name: f.name,
          path: f.meta.objectName,
          publicUrl: `${cfg.supabaseUrl}/storage/v1/object/public/${bucket}/${f.meta.objectName}`,
        }));
        opts.onComplete(urls, result);
      });
    }

    return uppy;
  }

  /* Single-file path for non-Dashboard flows (e.g. a vanilla input[type=file]).
     Uses the Supabase JS storage client directly, bypassing Tus. */
  async function uploadOne(file, { bucket, path }) {
    if (!root.SPAuth || !root.SPAuth.client) {
      throw new Error('SPAuth client unavailable');
    }
    const storage = root.SPAuth.client.storage.from(bucket);
    const { data, error } = await storage.upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;
    const { data: pub } = storage.getPublicUrl(data.path);
    return { path: data.path, publicUrl: pub.publicUrl };
  }

  root.SPUploader = { createUploader, uploadOne };
})(window);
