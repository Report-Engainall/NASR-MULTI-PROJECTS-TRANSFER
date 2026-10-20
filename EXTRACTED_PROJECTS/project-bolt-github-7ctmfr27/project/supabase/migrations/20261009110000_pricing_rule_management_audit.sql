-- Every pricing-rule mutation is auditable. The existing pricing refresh trigger remains
-- the single source of truth for recalculating derived retail/wholesale prices.
CREATE OR REPLACE FUNCTION public.audit_pricing_rule_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid;
  v_rule_id uuid;
  v_old_value jsonb;
  v_new_value jsonb;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_organization_id := OLD.organization_id;
    v_rule_id := OLD.id;
    v_old_value := pg_catalog.to_jsonb(OLD);
    v_new_value := NULL;
    v_action := 'pricing_rule.deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_organization_id := NEW.organization_id;
    v_rule_id := NEW.id;
    v_old_value := NULL;
    v_new_value := pg_catalog.to_jsonb(NEW);
    v_action := 'pricing_rule.created';
  ELSE
    v_organization_id := NEW.organization_id;
    v_rule_id := NEW.id;
    v_old_value := pg_catalog.to_jsonb(OLD);
    v_new_value := pg_catalog.to_jsonb(NEW);
    v_action := 'pricing_rule.updated';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, public.current_profile_id(), v_action, 'pricing_rule',
    v_rule_id, v_old_value, v_new_value, pg_catalog.now()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_pricing_rule_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pricing_rules_audit_mutations ON public.pricing_rules;
CREATE TRIGGER pricing_rules_audit_mutations
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_pricing_rule_changes();
