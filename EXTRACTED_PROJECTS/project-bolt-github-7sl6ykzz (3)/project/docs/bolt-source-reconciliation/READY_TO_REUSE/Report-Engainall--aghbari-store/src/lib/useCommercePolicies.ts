import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export type QuantityInputTone = 'sky' | 'mint' | 'slate'

export interface CommercePolicies {
  customer_prices_hidden: boolean
  require_quantity_approval: boolean
  payment_request_after_approval: boolean
  quantity_input_tone: QuantityInputTone
  upload_chunk_size_mb: number
  processing_chunk_size: number
  max_file_size_mb: number
  max_import_rows: number
  max_import_columns: number
  max_cell_length: number
  max_archive_expansion_factor: number
  dqs_excellent_min: number
  dqs_acceptable_min: number
  dqs_warning_min: number
  import_retention_days: number
  idempotency_ttl_hours: number
  max_processing_timeout_seconds: number
  api_p95_target_ms: number
  search_p95_target_ms: number
  ai_daily_token_quota: number
  ai_monthly_token_quota: number
  ai_request_budget_usd: number
  ai_external_data_requires_consent: boolean
  ai_rule_based_fallback: boolean
  offline_orders_disabled: boolean
}

export const DEFAULT_COMMERCE_POLICIES: CommercePolicies = {
  customer_prices_hidden: true,
  require_quantity_approval: true,
  payment_request_after_approval: true,
  quantity_input_tone: 'sky',
  upload_chunk_size_mb: 4,
  processing_chunk_size: 500,
  max_file_size_mb: 100,
  max_import_rows: 100000,
  max_import_columns: 100,
  max_cell_length: 4000,
  max_archive_expansion_factor: 10,
  dqs_excellent_min: 90,
  dqs_acceptable_min: 75,
  dqs_warning_min: 50,
  import_retention_days: 30,
  idempotency_ttl_hours: 24,
  max_processing_timeout_seconds: 300,
  api_p95_target_ms: 300,
  search_p95_target_ms: 150,
  ai_daily_token_quota: 0,
  ai_monthly_token_quota: 0,
  ai_request_budget_usd: 0,
  ai_external_data_requires_consent: true,
  ai_rule_based_fallback: true,
  offline_orders_disabled: true,
}

export function useCommercePolicies() {
  const { organization } = useAuth()
  const [policies, setPolicies] = useState<CommercePolicies>(DEFAULT_COMMERCE_POLICIES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!organization?.id) {
      setPolicies(DEFAULT_COMMERCE_POLICIES)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('commerce_policy_settings')
      .select('*')
      .eq('organization_id', organization.id)
      .maybeSingle()

    if (queryError) {
      // Fail closed: customer prices remain hidden and quantity approval remains required.
      setPolicies(DEFAULT_COMMERCE_POLICIES)
      setError(queryError.message)
    } else {
      setPolicies({
        ...DEFAULT_COMMERCE_POLICIES,
        ...(data ?? {}),
        customer_prices_hidden: true,
        require_quantity_approval: true,
        payment_request_after_approval: true,
        offline_orders_disabled: true,
        ai_external_data_requires_consent: true,
        ai_rule_based_fallback: true,
      } as CommercePolicies)
      setError(null)
    }
    setLoading(false)
  }, [organization?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(async (next: CommercePolicies) => {
    if (!organization?.id) {
      setError('تعذر تحديد المؤسسة الحالية.')
      return false
    }

    setSaving(true)
    setError(null)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      setError('انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.')
      setSaving(false)
      return false
    }

    const { error: saveError } = await supabase
      .from('commerce_policy_settings')
      .upsert({
        organization_id: organization.id,
        customer_prices_hidden: true,
        require_quantity_approval: true,
        payment_request_after_approval: true,
        quantity_input_tone: next.quantity_input_tone,
        upload_chunk_size_mb: next.upload_chunk_size_mb,
        processing_chunk_size: next.processing_chunk_size,
        max_file_size_mb: next.max_file_size_mb,
        max_import_rows: next.max_import_rows,
        max_import_columns: next.max_import_columns,
        max_cell_length: next.max_cell_length,
        max_archive_expansion_factor: next.max_archive_expansion_factor,
        dqs_excellent_min: next.dqs_excellent_min,
        dqs_acceptable_min: next.dqs_acceptable_min,
        dqs_warning_min: next.dqs_warning_min,
        import_retention_days: next.import_retention_days,
        idempotency_ttl_hours: next.idempotency_ttl_hours,
        max_processing_timeout_seconds: next.max_processing_timeout_seconds,
        api_p95_target_ms: next.api_p95_target_ms,
        search_p95_target_ms: next.search_p95_target_ms,
        ai_daily_token_quota: next.ai_daily_token_quota,
        ai_monthly_token_quota: next.ai_monthly_token_quota,
        ai_request_budget_usd: next.ai_request_budget_usd,
        ai_external_data_requires_consent: true,
        ai_rule_based_fallback: true,
        offline_orders_disabled: true,
        updated_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return false
    }
    setPolicies({ ...next, customer_prices_hidden: true, require_quantity_approval: true, payment_request_after_approval: true, offline_orders_disabled: true, ai_external_data_requires_consent: true, ai_rule_based_fallback: true })
    return true
  }, [organization?.id])

  return { policies, setPolicies, loading, saving, error, refresh, save }
}
