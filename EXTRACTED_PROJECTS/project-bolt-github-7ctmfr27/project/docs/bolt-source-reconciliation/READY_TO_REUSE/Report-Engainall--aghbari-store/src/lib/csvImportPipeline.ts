import { supabase } from '@/lib/supabase'

type JsonRecord = Record<string, unknown>

export interface CsvImportProfile {
  id: string
  required_columns?: unknown
  optional_columns?: unknown
  ignored_columns?: unknown
  synonyms?: unknown
  validation_rules?: unknown
  matching_key?: string
}

export interface CsvImportProgress {
  stage: string
  processedRows: number
}

export interface CsvImportPolicies {
  max_file_size_mb: number
  max_import_rows: number
  max_import_columns: number
  max_cell_length: number
  processing_chunk_size: number
  dqs_excellent_min: number
  dqs_acceptable_min: number
  dqs_warning_min: number
  import_retention_days: number
}

export interface CsvImportResult {
  uploadId: string
  status: 'snapshotted' | 'manual_review' | 'rejected'
  totalRows: number
  acceptedRows: number
  warningRows: number
  rejectedRows: number
  duplicateRows: number
  qualityScore: number | null
  message: string
}

const MAX_ROWS = 100_000
const MAX_COLUMNS = 100
const MAX_CELL_LENGTH = 4_000
const PROCESSING_BATCH_SIZE = 500

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function normalizeHeader(value: string): string {
  return value.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar').replace(/[\s_-]+/g, ' ').trim()
}

function normalizeCell(value: string): string {
  // SKU/customer/supplier codes remain strings. In particular, leading zeroes are never numerically coerced.
  return value.replace(/\s+/g, ' ').trim()
}

function fieldSynonyms(profile: CsvImportProfile, field: string): string[] {
  const dict = profile.synonyms && typeof profile.synonyms === 'object' ? profile.synonyms as JsonRecord : {}
  const value = dict[field]
  return [field, ...asStringArray(value)]
}

function buildMapping(headers: string[], profile: CsvImportProfile): Record<string, number> {
  const required = asStringArray(profile.required_columns)
  const optional = asStringArray(profile.optional_columns)
  const ignored = new Set(asStringArray(profile.ignored_columns).map(normalizeHeader))
  const mapping: Record<string, number> = {}
  const normalizedHeaders = headers.map(normalizeHeader)
  for (const field of [...new Set([...required, ...optional])]) {
    if (ignored.has(normalizeHeader(field))) continue
    const alternatives = new Set(fieldSynonyms(profile, field).map(normalizeHeader))
    const index = normalizedHeaders.findIndex(header => alternatives.has(header))
    if (index >= 0) mapping[field] = index
  }
  return mapping
}

/** Streaming CSV reader: records and fields are yielded incrementally, not collected as a full dataset. */
async function* csvRows(file: File): AsyncGenerator<string[]> {
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8')
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let pendingQuote = false
  let skipLf = false

  const emit = (): string[] => {
    row.push(field)
    field = ''
    const result = row
    row = []
    return result
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      const chunk = done ? decoder.decode() : decoder.decode(value, { stream: true })
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i]
        if (skipLf) {
          skipLf = false
          if (char === '\n') continue
        }
        if (pendingQuote) {
          pendingQuote = false
          if (char === '"') {
            field += '"'
            inQuotes = true
            continue
          }
          inQuotes = false
        }
        if (inQuotes) {
          if (char === '"') {
            if (i + 1 < chunk.length) {
              if (chunk[i + 1] === '"') { field += '"'; i++ }
              else inQuotes = false
            } else {
              pendingQuote = true
            }
          } else {
            field += char
          }
          continue
        }
        if (char === '"' && field.length === 0) { inQuotes = true; continue }
        if (char === ',') { row.push(field); field = ''; continue }
        if (char === '\n') { yield emit(); continue }
        if (char === '\r') { yield emit(); skipLf = true; continue }
        field += char
      }
      if (done) break
    }
    if (pendingQuote) { pendingQuote = false; inQuotes = false }
    if (inQuotes) throw new Error('CSV_MALFORMED_QUOTED_FIELD')
    if (field.length > 0 || row.length > 0) yield emit()
  } finally {
    reader.releaseLock()
  }
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 100 : Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

async function setUpload(uploadId: string, organizationId: string, patch: JsonRecord): Promise<void> {
  const { error } = await supabase.from('import_uploads').update(patch)
    .eq('id', uploadId)
    .eq('organization_id', organizationId)
  if (error) throw error
}

/**
 * The CSV path performs real streaming extraction, mapping, validation, normalization, deduplication,
 * row chunking, and snapshotting. It deliberately stops before changing live operational records.
 */
export async function processCsvToSnapshot(args: {
  file: File
  organizationId: string
  profile: CsvImportProfile
  fileHash: string
  policies?: Partial<CsvImportPolicies>
  signal?: AbortSignal
  waitIfPaused?: () => Promise<void>
  existingUploadId?: string
  claimedUploadId?: string
  onProgress?: (progress: CsvImportProgress) => void
}): Promise<CsvImportResult> {
  const { file, organizationId, profile, fileHash, policies = {}, signal, waitIfPaused, existingUploadId, claimedUploadId, onProgress } = args
  const limits = {
    maxFileSizeMb: policies.max_file_size_mb ?? 100,
    maxRows: policies.max_import_rows ?? MAX_ROWS,
    maxColumns: policies.max_import_columns ?? MAX_COLUMNS,
    maxCellLength: policies.max_cell_length ?? MAX_CELL_LENGTH,
    batchSize: policies.processing_chunk_size ?? PROCESSING_BATCH_SIZE,
    dqsExcellentMin: policies.dqs_excellent_min ?? 90,
    dqsAcceptableMin: policies.dqs_acceptable_min ?? 75,
    dqsWarningMin: policies.dqs_warning_min ?? 50,
    retentionDays: policies.import_retention_days ?? 30,
  }
  if (file.size > limits.maxFileSizeMb * 1024 * 1024) throw new Error('MAX_FILE_SIZE_EXCEEDED')
  if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
  let uploadId: string
  if (existingUploadId && claimedUploadId) throw new Error('IMPORT_UPLOAD_IDENTITY_CONFLICT')
  if (!existingUploadId && !claimedUploadId) throw new Error('IMPORT_UPLOAD_CLAIM_REQUIRED')

  if (existingUploadId) {
    const { data: retryClaimed, error: claimError } = await supabase.rpc('claim_failed_import_retry', {
      p_organization_id: organizationId,
      p_upload_id: existingUploadId,
      p_expires_at: new Date(Date.now() + limits.retentionDays * 86400000).toISOString(),
    })
    if (claimError) throw claimError
    if (retryClaimed !== true) throw new Error('IMPORT_RETRY_ALREADY_CLAIMED')

    const { error: clearError } = await supabase.from('import_records').delete()
      .eq('upload_id', existingUploadId)
    if (clearError) {
      const { error: restoreError } = await supabase.from('import_uploads').update({
        status: 'failed',
        error_code: 'IMPORT_RETRY_CLEANUP_FAILED',
        error_message: clearError.message,
      }).eq('id', existingUploadId).eq('organization_id', organizationId)
      if (restoreError) throw new Error(`IMPORT_RETRY_CLEANUP_FAILED: ${clearError.message}; status recovery also failed: ${restoreError.message}`)
      throw clearError
    }
    uploadId = existingUploadId
  } else {
    uploadId = claimedUploadId as string
  }
  const report = (stage: string, processedRows: number) => onProgress?.({ stage, processedRows })

  let totalRows = 0
  let completenessCells = 0
  let requiredCells = 0
  let validRows = 0
  let acceptedRows = 0
  let consistentRows = 0
  let nonEmptyKeys = 0
  let duplicateRows = 0
  let rejectedRows = 0
  let temporalApplicable = false
  let temporalValid = 0
  let temporalTotal = 0
  const seenKeys = new Set<string>()
  const batch: JsonRecord[] = []
  let headers: string[] = []
  let mapping: Record<string, number> = {}
  const required = asStringArray(profile.required_columns)
  const matchingKey = profile.matching_key || 'item_code'

  try {
    report('اكتشاف بنية CSV', 0)
    const iterator = csvRows(file)
    const first = await iterator.next()
    const firstRow = (first.value || []) as string[]
    headers = firstRow.map((header: string, index: number) => index === 0 ? header.replace(/^\uFEFF/, '') : header)
    if (first.done || !headers.length || (headers.length === 1 && !headers[0].trim())) {
      throw new Error('CSV_HEADER_MISSING')
    }
    if (headers.length > limits.maxColumns) throw new Error('MAX_COLUMNS_EXCEEDED')

    await setUpload(uploadId, organizationId, { status: 'mapping' })
    mapping = buildMapping(headers, profile)
    const missingFields = required.filter(field => mapping[field] === undefined)
    if (missingFields.length) {
      const message = `أعمدة مطلوبة غير موجودة: ${missingFields.join('، ')}`
      await setUpload(uploadId, organizationId, {
        status: 'manual_review', error_code: 'MANUAL_MAPPING_REQUIRED',
        error_message: message,
        snapshot: { headers, missing_required_columns: missingFields, file_hash: fileHash },
      })
      return { uploadId, status: 'manual_review', totalRows: 0, acceptedRows: 0, warningRows: 0, rejectedRows: 0, duplicateRows: 0, qualityScore: null, message }
    }

    const dateFields = Object.keys(mapping).filter(field => /date|period|time|تاريخ|فترة|يوم/i.test(field))
    temporalApplicable = dateFields.length > 0
    await setUpload(uploadId, organizationId, { status: 'validating' })

    const flush = async () => {
      if (!batch.length) return
      const { error } = await supabase.from('import_records').insert(batch.splice(0, batch.length))
      if (error) throw error
      report('معالجة الدفعات', totalRows)
    }

    const consume = async (cells: string[]) => {
      if (cells.every(cell => !cell.trim())) return
      totalRows++
      if (totalRows > limits.maxRows) throw new Error('MAX_ROWS_EXCEEDED')
      let rowConsistent = cells.length === headers.length
      const errors: string[] = []
      const warnings: string[] = []
      if (!rowConsistent) errors.push('عدد الخلايا لا يطابق عدد الأعمدة')
      const normalized: Record<string, string> = {}
      for (const [field, index] of Object.entries(mapping)) {
        const raw = cells[index] ?? ''
        const value = normalizeCell(raw)
        normalized[field] = value.length > limits.maxCellLength ? value.slice(0, limits.maxCellLength) : value
        if (value.length > limits.maxCellLength) errors.push(`الحقل ${field} يتجاوز ${limits.maxCellLength} حرفاً`)
        if (required.includes(field)) {
          requiredCells++
          if (value) completenessCells++
          else errors.push(`الحقل المطلوب ${field} فارغ`)
        }
      }
      if (rowConsistent) consistentRows++
      if (errors.length === 0) validRows++
      const key = normalizeCell(normalized[matchingKey] || '')
      if (key) nonEmptyKeys++
      let isDuplicate = false
      if (key) {
        const normalizedKey = normalizeHeader(key)
        if (seenKeys.has(normalizedKey)) isDuplicate = true
        else seenKeys.add(normalizedKey)
      }
      if (isDuplicate) warnings.push(`مفتاح مكرر داخل الملف: ${key}`)
      for (const field of dateFields) {
        const value = normalized[field] || ''
        if (value) {
          temporalTotal++
          if (!Number.isNaN(Date.parse(value))) temporalValid++
          else warnings.push(`قيمة تاريخ غير قابلة للتحليل في ${field}`)
        }
      }
      const status = errors.length ? 'rejected' : isDuplicate ? 'duplicate' : 'accepted'
      if (status === 'accepted') acceptedRows++
      if (status === 'duplicate') duplicateRows++
      if (status === 'rejected') rejectedRows++
      batch.push({
        upload_id: uploadId,
        row_number: totalRows,
        matching_key: key || null,
        normalized_record: normalized,
        validation_errors: errors,
        validation_warnings: warnings,
        status,
      })
      if (batch.length >= limits.batchSize) await flush()
    }

    await setUpload(uploadId, organizationId, { status: 'normalizing' })
    for await (const row of iterator) {
      if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
      if (waitIfPaused) await waitIfPaused()
      if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
      await consume(row)
    }
    await flush()

    if (totalRows === 0) throw new Error('CSV_HAS_NO_DATA_ROWS')

    await setUpload(uploadId, organizationId, { status: 'deduplicating' })
    const completeness = safeRatio(completenessCells, requiredCells)
    const validity = safeRatio(validRows, totalRows)
    const uniqueness = safeRatio(totalRows - duplicateRows, totalRows)
    const consistency = safeRatio(consistentRows, totalRows)
    const temporalIntegrity = temporalTotal > 0 ? safeRatio(temporalValid, temporalTotal) : 100
    const temporalHasEvidence = temporalApplicable && temporalTotal > 0
    const matchingKeyCoverage = safeRatio(nonEmptyKeys, totalRows)
    const activeWeight = 0.25 + 0.25 + 0.20 + 0.10 + 0.10 + (temporalHasEvidence ? 0.10 : 0)
    const weightedScore = completeness * 0.25 + validity * 0.25 + uniqueness * 0.20 + consistency * 0.10 + matchingKeyCoverage * 0.10 + (temporalHasEvidence ? temporalIntegrity * 0.10 : 0)
    const qualityScore = Math.round((weightedScore / activeWeight) * 100) / 100

    const qualityBreakdown = {
      score: qualityScore,
      completeness, validity, uniqueness, consistency,
      matching_key_coverage: matchingKeyCoverage,
      temporal_integrity: { score: temporalIntegrity, applicable: temporalHasEvidence, checked_values: temporalTotal },
      referential_integrity: { score: null, applicable: false, reason: 'التحقق من العلاقات المرجعية بين الجداول يُجرى قبل الدمج؛ لم يُنفذ في مرحلة Snapshot.' },
      weights: { completeness: 0.25, validity: 0.25, uniqueness: 0.2, consistency: 0.1, matching_key_coverage: 0.1, temporal_integrity: temporalHasEvidence ? 0.1 : 0 },
    }

    await setUpload(uploadId, organizationId, { status: 'chunking' })
    let status: CsvImportResult['status'] = qualityScore >= limits.dqsWarningMin ? 'snapshotted' : 'rejected'
    let message = 'تم توحيد السجلات والتحقق منها وحفظ بيان Snapshot؛ لم تُدمج البيانات في قاعدة التشغيل.'
    if (qualityScore >= limits.dqsAcceptableMin && qualityScore < limits.dqsExcellentMin) {
      const { error: warningError } = await supabase.from('import_records').update({ status: 'warning' }).eq('upload_id', uploadId).eq('status', 'accepted')
      if (warningError) throw warningError
      message = 'تم حفظ Snapshot مع تحذير جودة؛ لم تُدمج البيانات في قاعدة التشغيل.'
    } else if (qualityScore >= limits.dqsWarningMin && qualityScore < limits.dqsAcceptableMin) {
      status = 'manual_review'
      message = 'جودة البيانات تتطلب مراجعة بشرية قبل أي اعتماد.'
    } else if (qualityScore < limits.dqsWarningMin) {
      const { error: rejectError } = await supabase.from('import_records').update({ status: 'rejected' }).eq('upload_id', uploadId)
      if (rejectError) throw rejectError
      message = 'رُفضت الدفعة لأن جودة البيانات أقل من 50؛ لم تُدمج أي بيانات.'
    }

    await setUpload(uploadId, organizationId, { status: 'snapshotted' })
    const manifest = {
      manifest_version: 1, file_name: file.name, file_type: 'csv', file_size: file.size,
      file_hash: fileHash, profile_id: profile.id, profile_version: (profile as unknown as JsonRecord).version ?? null,
      headers, column_mapping: mapping, total_rows: totalRows,
      accepted_rows: acceptedRows,
      warning_rows: qualityScore >= limits.dqsAcceptableMin && qualityScore < limits.dqsExcellentMin ? acceptedRows : 0,
      rejected_rows: rejectedRows, duplicate_rows: duplicateRows, dqs: qualityBreakdown,
      snapshot_at: new Date().toISOString(), raw_file_persisted: false,
      live_data_merged: false,
    }
    await setUpload(uploadId, organizationId, {
      status,
      quality_score: qualityScore,
      quality_breakdown: qualityBreakdown,
      error_code: qualityScore < limits.dqsAcceptableMin ? 'DQS_REVIEW_REQUIRED' : qualityScore < limits.dqsExcellentMin ? 'DQS_WARNINGS' : null,
      error_message: qualityScore < limits.dqsAcceptableMin ? message : null,
      snapshot: manifest,
    })
    return {
      uploadId, status, totalRows, acceptedRows,
      warningRows: qualityScore >= limits.dqsAcceptableMin && qualityScore < limits.dqsExcellentMin ? acceptedRows : 0,
      rejectedRows, duplicateRows, qualityScore, message,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'IMPORT_PROCESSING_FAILED'
    await supabase.from('import_uploads').update({
      status: 'failed', error_code: reason, error_message: reason,
    }).eq('id', uploadId)
    throw error
  }
}
