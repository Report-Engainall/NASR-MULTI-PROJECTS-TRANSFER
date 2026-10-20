import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from './types'

export interface CartItem { product: Product; quantity: number; unitPrice: number }
interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity: number, unitPrice: number) => void
  updateQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  clearCart: () => void
  getTotalItems: () => number
  getTotalAmount: () => number
}
export const useCartStore = create<CartState>()(
  persist((set, get) => ({
    items: [],
    addItem: (product, quantity, unitPrice) => {
      const existing = get().items.find((i) => i.product.id === product.id)
      if (existing) set({ items: get().items.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity, unitPrice } : i) })
      else set({ items: [...get().items, { product, quantity, unitPrice }] })
    },
    updateQuantity: (productId, quantity) => {
      if (quantity <= 0) { get().removeItem(productId); return }
      set({ items: get().items.map((i) => i.product.id === productId ? { ...i, quantity } : i) })
    },
    removeItem: (productId) => set({ items: get().items.filter((i) => i.product.id !== productId) }),
    clearCart: () => set({ items: [] }),
    getTotalItems: () => get().items.reduce((s) => s + 1, 0),
    getTotalAmount: () => get().items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
  }), { name: 'aghbari-cart' })
)
