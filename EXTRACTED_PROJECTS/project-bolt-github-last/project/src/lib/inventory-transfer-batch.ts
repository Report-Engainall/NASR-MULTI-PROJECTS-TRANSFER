export type InventoryTransferBatchLineInput = {
  productId: string;
  quantity: number;
};

export type InventoryTransferBatchDraft = {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  reason: string;
  lines: InventoryTransferBatchLineInput[];
};

export type InventoryTransferBatchInput = InventoryTransferBatchDraft & {
  idempotencyKey: string;
};

export type NormalizedInventoryTransferBatchDraft = {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  reason: string;
  lines: Array<{ productId: string; quantity: number }>;
};

export const MAX_INVENTORY_TRANSFER_BATCH_LINES = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function normalizeInventoryTransferBatchDraft(
  input: InventoryTransferBatchDraft,
): NormalizedInventoryTransferBatchDraft {
  const sourceWarehouseId = input.sourceWarehouseId.trim();
  const destinationWarehouseId = input.destinationWarehouseId.trim();
  const reason = input.reason.trim();
  if (!UUID_PATTERN.test(sourceWarehouseId) || !UUID_PATTERN.test(destinationWarehouseId)) {
    throw new Error('معرّف مستودع المصدر أو الوجهة غير صالح.');
  }
  if (sourceWarehouseId === destinationWarehouseId) {
    throw new Error('اختر مستودعين مختلفين لتحويل الدفعة.');
  }
  if (!reason || reason.length > 1000) {
    throw new Error('سبب التحويل مطلوب ولا يتجاوز 1000 حرف.');
  }
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > MAX_INVENTORY_TRANSFER_BATCH_LINES) {
    throw new Error('يجب أن تتكون دفعة التحويل من صنف واحد إلى 200 صنف.');
  }

  const seenProducts = new Set<string>();
  const lines = input.lines.map((line) => {
    const productId = line.productId.trim();
    if (!UUID_PATTERN.test(productId)) throw new Error('اختر صنفًا صحيحًا لكل سطر.');
    if (seenProducts.has(productId)) throw new Error('لا يمكن تكرار الصنف نفسه في دفعة التحويل.');
    seenProducts.add(productId);
    const quantity = line.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999999.999 ||
        !Number.isSafeInteger(Math.round(quantity * 1000)) || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-8) {
      throw new Error('كمية كل صنف يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.');
    }
    return { productId, quantity };
  }).sort((a, b) => a.productId.localeCompare(b.productId));

  return { sourceWarehouseId, destinationWarehouseId, reason, lines };
}

export function inventoryTransferBatchSignature(input: InventoryTransferBatchDraft): string {
  const normalized = normalizeInventoryTransferBatchDraft(input);
  return JSON.stringify({
    sourceWarehouseId: normalized.sourceWarehouseId,
    destinationWarehouseId: normalized.destinationWarehouseId,
    reason: normalized.reason,
    lines: normalized.lines,
  });
}

export function validateInventoryTransferBatchInput(
  input: InventoryTransferBatchInput,
): NormalizedInventoryTransferBatchDraft & { idempotencyKey: string } {
  const normalized = normalizeInventoryTransferBatchDraft(input);
  const idempotencyKey = input.idempotencyKey.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new Error('مفتاح منع تكرار دفعة التحويل غير صالح.');
  }
  return { ...normalized, idempotencyKey };
}
