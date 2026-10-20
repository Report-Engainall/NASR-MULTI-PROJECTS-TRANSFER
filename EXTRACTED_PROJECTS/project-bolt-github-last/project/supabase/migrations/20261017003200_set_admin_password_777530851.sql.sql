DO $$
DECLARE
  v_uid uuid := '2b5a18bc-e006-4d5c-8b66-405b81d628fb';
BEGIN
  -- Update password to the requested admin credentials
  UPDATE auth.users
    SET encrypted_password = crypt('En@$2026', gen_salt('bf'))
    WHERE id = v_uid;
END $$;