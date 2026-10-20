-- Staff operational export needs access to all price tiers within the authenticated organization.
-- Customer-facing reads remain restricted by the existing customer-tier policy; this policy is
-- additive for authenticated staff and remains tenant-scoped.

CREATE POLICY product_prices_staff_read ON public.product_prices
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.is_staff()
  );
