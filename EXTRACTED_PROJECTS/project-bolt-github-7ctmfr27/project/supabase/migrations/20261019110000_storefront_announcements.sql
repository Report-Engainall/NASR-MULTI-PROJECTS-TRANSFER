-- Tenant-bound storefront announcements. Public reads are filtered by the server;
-- all writes go through an audited admin/manager command, never direct browser DML.
BEGIN;

CREATE TABLE public.storefront_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  content text CHECK (content IS NULL OR char_length(content) <= 600),
  href text CHECK (
    href IS NULL OR
    (left(href, 1) = '/' AND left(href, 2) <> '//') OR
    (href LIKE 'https://%' AND char_length(href) > 8 AND href !~ '[[:space:]]')
  ),
  color text NOT NULL DEFAULT '#B99347' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'customers', 'staff')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX storefront_announcements_public_order_idx
  ON public.storefront_announcements (organization_id, is_active, priority, created_at DESC);
ALTER TABLE public.storefront_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_announcements FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storefront_announcements TO service_role;

CREATE OR REPLACE FUNCTION public.get_storefront_announcements()
RETURNS TABLE (id uuid, title text, content text, href text, color text, priority integer, starts_at timestamptz, ends_at timestamptz, audience text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.public_storefront_organization_id();
  v_is_customer boolean := false;
  v_is_staff boolean := false;
BEGIN
  IF v_organization_id IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
      WHERE p.auth_user_id=auth.uid() AND p.organization_id=v_organization_id AND p.is_active=true AND r.role='customer'
    ) INTO v_is_customer;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
      WHERE p.auth_user_id=auth.uid() AND p.organization_id=v_organization_id AND p.is_active=true
        AND r.role IN ('admin','manager','staff','accountant')
    ) INTO v_is_staff;
  END IF;
  RETURN QUERY
  SELECT a.id,a.title,a.content,a.href,a.color,a.priority,a.starts_at,a.ends_at,a.audience
  FROM public.storefront_announcements AS a
  WHERE a.organization_id=v_organization_id AND a.is_active=true
    AND (a.starts_at IS NULL OR a.starts_at<=pg_catalog.now())
    AND (a.ends_at IS NULL OR a.ends_at>pg_catalog.now())
    AND (a.audience='all' OR (a.audience='customers' AND v_is_customer) OR (a.audience='staff' AND v_is_staff))
  ORDER BY a.priority ASC,a.created_at DESC,a.id LIMIT 10;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_storefront_announcements()
RETURNS TABLE (id uuid,title text,content text,href text,color text,priority integer,is_active boolean,starts_at timestamptz,ends_at timestamptz,audience text,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_organization_id uuid:=public.current_organization_id(); v_profile_id uuid:=public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Storefront announcement management requires an active admin or manager';
  END IF;
  RETURN QUERY SELECT a.id,a.title,a.content,a.href,a.color,a.priority,a.is_active,a.starts_at,a.ends_at,a.audience,a.created_at,a.updated_at
  FROM public.storefront_announcements AS a WHERE a.organization_id=v_organization_id ORDER BY a.priority ASC,a.created_at DESC,a.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.save_storefront_announcement(
  p_announcement_id uuid,p_title text,p_content text,p_href text,p_color text,p_priority integer,p_is_active boolean,
  p_starts_at timestamptz,p_ends_at timestamptz,p_audience text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid:=public.current_organization_id();
  v_profile_id uuid:=public.current_profile_id();
  v_title text:=btrim(coalesce(p_title,''));
  v_content text:=nullif(btrim(coalesce(p_content,'')),'');
  v_href text:=nullif(btrim(coalesce(p_href,'')),'');
  v_id uuid:=p_announcement_id;
  v_old jsonb; v_new jsonb; v_action text; v_row public.storefront_announcements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Storefront announcement writes require an active admin or manager';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement title must contain 1 to 120 characters'; END IF;
  IF v_content IS NOT NULL AND char_length(v_content)>600 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement content must not exceed 600 characters'; END IF;
  IF v_href IS NOT NULL AND NOT ((left(v_href,1)='/' AND left(v_href,2)<>'//') OR (v_href LIKE 'https://%' AND char_length(v_href)>8 AND v_href !~ '[[:space:]]')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement link must be an internal path or HTTPS URL';
  END IF;
  IF p_color IS NULL OR p_color !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement color must be a six-digit hex color'; END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement priority must be an integer from 0 to 10000'; END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all','customers','staff') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement audience is not supported'; END IF;
  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at<=p_starts_at THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement end must be after its start'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.storefront_announcements(organization_id,title,content,href,color,priority,is_active,starts_at,ends_at,audience,created_by,updated_by)
    VALUES(v_organization_id,v_title,v_content,v_href,p_color,p_priority,coalesce(p_is_active,false),p_starts_at,p_ends_at,p_audience,v_profile_id,v_profile_id)
    RETURNING * INTO v_row;
    v_id:=v_row.id; v_action:='storefront_announcement.created';
  ELSE
    SELECT pg_catalog.to_jsonb(a) INTO v_old FROM public.storefront_announcements AS a
    WHERE a.id=v_id AND a.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Announcement not found for this organization'; END IF;
    UPDATE public.storefront_announcements AS a SET title=v_title,content=v_content,href=v_href,color=p_color,priority=p_priority,
      is_active=coalesce(p_is_active,false),starts_at=p_starts_at,ends_at=p_ends_at,audience=p_audience,
      updated_by=v_profile_id,updated_at=pg_catalog.now()
    WHERE a.id=v_id AND a.organization_id=v_organization_id RETURNING a.* INTO v_row;
    v_action:='storefront_announcement.updated';
  END IF;
  v_new:=pg_catalog.to_jsonb(v_row);
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_organization_id,v_profile_id,v_action,'storefront_announcement',v_id,v_old,v_new);
  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_announcements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_announcements() TO anon,authenticated;
REVOKE ALL ON FUNCTION public.get_admin_storefront_announcements() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_storefront_announcements() TO authenticated;
REVOKE ALL ON FUNCTION public.save_storefront_announcement(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_storefront_announcement(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,text) TO authenticated;
COMMENT ON TABLE public.storefront_announcements IS 'Tenant-bound storefront announcements; server-filtered public reads and audited command writes.';
COMMIT;
