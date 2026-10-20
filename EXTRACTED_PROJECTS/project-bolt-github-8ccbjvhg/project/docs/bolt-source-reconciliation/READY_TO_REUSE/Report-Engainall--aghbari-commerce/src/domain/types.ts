export type CustomerTier = 'retail' | 'wholesale' | 'distributor';
export type OrderStatus = 'draft' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface Product {
  id: string;
  sku: string;
  name: string;
  imageUrl?: string;
  unit: string;
  category: string;
  subcategory?: string;
  description?: string;
  availableQuantity: number;
  status: 'active' | 'inactive';
}

export interface ProductPrice {
  productId: string;
  tier: CustomerTier;
  amount: number;
  currency: string;
  validFrom: string;
  validTo?: string;
}

export interface CartLine {
  product: Product;
  quantity: number;
  unitPrice: number;
}

export interface OrderDraft {
  // Deprecated compatibility field. It is intentionally ignored by validation and the RPC.
  // The authenticated server context remains the sole authority for customer binding.
  customerId?: string;
  idempotencyKey: string;
  lines: Array<{ productId: string; quantity: number }>;
}
