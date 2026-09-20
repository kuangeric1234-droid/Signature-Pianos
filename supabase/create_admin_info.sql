-- =============================================================================
-- SIGNATURE PIANOS — CREATE ADMIN LOGIN: info@signaturepianos.com.au
-- =============================================================================
-- Run ONCE in the Supabase SQL editor (project ernwymzmwhscsjgrnouv).
--
-- Does two things atomically:
--   1. Creates the auth user (email + password) so you can sign in.
--   2. Inserts the matching admin_users row (role super_admin, active) so the
--      admin gate at admin/index.html lets you through.
--
-- Safe to re-run: if the user already exists it just (re)sets the password and
-- makes sure the admin_users row is present + active.
--
-- >>> Set the password at run time: paste it over the placeholder on the
-- v_password line in the SQL editor, run, then close the tab WITHOUT saving.
-- Never commit a real password to this file (it is in the public repo). <<<
-- =============================================================================

DO $$
DECLARE
  v_email    text := 'info@signaturepianos.com.au';
  v_password text := '<set-a-strong-password-here>';     -- <<< set at run time, never commit
  v_uid      uuid;
BEGIN
  IF v_password = '<set-a-strong-password-here>' OR length(v_password) < 12 THEN
    RAISE EXCEPTION 'Set v_password to a strong password (12+ characters) before running.';
  END IF;

  -- 1. Auth user -------------------------------------------------------------
  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(v_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', ''
    );
  ELSE
    -- Already exists: reset password + confirm email so login works.
    UPDATE auth.users
       SET encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_uid;
  END IF;

  -- 2. Email identity (required by GoTrue for password sign-in) --------------
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_email, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- 3. Admin row ------------------------------------------------------------
  INSERT INTO admin_users (user_id, first_name, last_name, email, role, active)
  VALUES (v_uid, 'Signature', 'Pianos', v_email, 'super_admin', true)
  ON CONFLICT (email) DO UPDATE
     SET user_id = EXCLUDED.user_id,
         role    = 'super_admin',
         active  = true,
         updated_at = now();

  RAISE NOTICE 'Admin ready: % (uid %)', v_email, v_uid;
END $$;
