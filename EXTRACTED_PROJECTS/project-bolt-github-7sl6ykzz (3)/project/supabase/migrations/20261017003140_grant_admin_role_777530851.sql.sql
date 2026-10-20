DO $$
DECLARE
  v_uid uuid := '2b5a18bc-e006-4d5c-8b66-405b81d628fb';
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';
  v_pid uuid;
BEGIN
  -- Link profile to the existing auth user
  SELECT id INTO v_pid FROM profiles WHERE auth_user_id = v_uid;
  IF v_pid IS NULL THEN
    INSERT INTO profiles (organization_id, auth_user_id, full_name, email, phone)
    VALUES (v_org, v_uid, 'المهندس / نصر عدنان الأغبري', '777530851@aghbari.store', '777530851')
    RETURNING id INTO v_pid;
  END IF;

  -- Grant admin role (remove customer role if present)
  DELETE FROM user_roles WHERE profile_id = v_pid AND role = 'customer';
  INSERT INTO user_roles (profile_id, role) VALUES (v_pid, 'admin')
    ON CONFLICT (profile_id, role) DO NOTHING;

  -- Set app_metadata so the frontend auth check recognises admin
  UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"user_role":"admin"}'::jsonb
    WHERE id = v_uid;
END $$;