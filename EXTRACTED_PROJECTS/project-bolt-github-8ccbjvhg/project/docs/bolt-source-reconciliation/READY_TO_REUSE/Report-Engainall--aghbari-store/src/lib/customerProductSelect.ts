/**
 * Public storefront projection of a product.
 *
 * Financial values are intentionally not selected here. Staff screens that
 * require prices use their separately authorized administrative data path.
 */
export const CUSTOMER_PRODUCT_SELECT = [
  'id', 'organization_id', 'category_id', 'brand_id',
  'sku', 'name', 'name_ar', 'slug', 'description', 'unit',
  'box_quantity', 'carton_quantity', 'min_order_qty',
  'stock_quantity', 'barcode',
  'image_url', 'is_active', 'is_featured', 'is_new', 'tags',
  'created_at', 'updated_at',
  'category:categories(id,name,slug)',
  'brand:brands(id,name,slug,logo_url)',
].join(',')
