-- Enforce contiguous upload-chunk registration on the server. The browser's prefix
-- validation is defense in depth; authenticated RPC callers must not create a gapped
-- manifest that can be counted as complete.
CREATE OR REPLACE FUNCTION public.record_import_upload_chunk(
  p_session_id uuid, p_chunk_number integer, p_byte_offset bigint, p_byte_size integer, p_chunk_hash text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_session public.import_upload_sessions%ROWTYPE;
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_expected_offset bigint;
  v_expected_size integer;
  v_existing public.import_upload_chunks%ROWTYPE;
  v_verified integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بتسجيل شريحة استيراد';
  END IF;
  SELECT s.* INTO v_session FROM public.import_upload_sessions s
   WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_session.status IN ('completed','cancelled','expired') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='جلسة الاستيراد غير متاحة';
  END IF;
  IF p_chunk_number<0 OR p_chunk_number>=v_session.total_chunks
     OR coalesce(p_chunk_hash,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بيانات شريحة الاستيراد غير صالحة';
  END IF;
  v_expected_offset := p_chunk_number::bigint*v_session.chunk_size_bytes;
  v_expected_size := least(v_session.chunk_size_bytes,(v_session.file_size-v_expected_offset)::integer);
  IF p_byte_offset<>v_expected_offset OR p_byte_size<>v_expected_size OR p_byte_size<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='حجم أو موضع شريحة الاستيراد لا يطابق الجلسة';
  END IF;

  -- Locking the parent session serializes writers. Count plus maximum guards against
  -- pre-existing gaps; a missing chunk is permitted only at the end of the prefix.
  SELECT count(*)::integer INTO v_verified
    FROM public.import_upload_chunks c WHERE c.session_id=p_session_id;
  IF v_verified > 0 AND EXISTS (
    SELECT 1 FROM public.import_upload_chunks c
     WHERE c.session_id=p_session_id AND c.chunk_number >= v_verified
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سجل شرائح الاستيراد غير متصل؛ يلزم بدء جلسة جديدة';
  END IF;

  SELECT c.* INTO v_existing FROM public.import_upload_chunks c
   WHERE c.session_id=p_session_id AND c.chunk_number=p_chunk_number;
  IF FOUND THEN
    IF v_existing.byte_offset<>p_byte_offset OR v_existing.byte_size<>p_byte_size OR v_existing.chunk_hash<>p_chunk_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تعارض في بصمة شريحة سبق التحقق منها';
    END IF;
  ELSE
    IF p_chunk_number <> v_verified THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب تسجيل شرائح الاستيراد بالتتابع دون تخطي';
    END IF;
    INSERT INTO public.import_upload_chunks(session_id,organization_id,chunk_number,byte_offset,byte_size,chunk_hash)
    VALUES(p_session_id,v_org,p_chunk_number,p_byte_offset,p_byte_size,p_chunk_hash);
    v_verified := v_verified + 1;
  END IF;

  UPDATE public.import_upload_sessions
     SET verified_chunks=v_verified,
         status=CASE WHEN v_verified=total_chunks THEN 'uploaded' ELSE 'uploading' END,
         updated_at=now()
   WHERE id=p_session_id;
  RETURN jsonb_build_object(
    'session_id',p_session_id,
    'verified_chunks',v_verified,
    'total_chunks',v_session.total_chunks,
    'complete',v_verified=v_session.total_chunks
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_import_upload_chunk(uuid,integer,bigint,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_import_upload_chunk(uuid,integer,bigint,integer,text) TO authenticated;
