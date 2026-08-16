'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Minus, Plus, Search, ShoppingBag, Utensils, X } from 'lucide-react'
import MenuAssistant from './menu-assistant'

type Restaurant = { id: string; name: string; address?: string | null; currency: string }
type Table = { id: string; table_number: string; seats: number }
type Category = { id: string; name: string; description?: string | null }
type MenuItem = { id: string; category_id?: string | null; name: string; description?: string | null; price: string; image_url?: string | null }
type CartLine = MenuItem & { quantity: number }
type Order = { id: string; order_number: string; status: string; subtotal: string; tax: string; total: string }

const API = '/api'
const money = (value: string | number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value))

export default function CustomerOrderingFlow({ restaurantSlug, tableId }: { restaurantSlug: string; tableId: string }) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [table, setTable] = useState<Table | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [payment, setPayment] = useState('pay-at-table')
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = window.localStorage.getItem(`qrserve-cart-${restaurantSlug}-${tableId}`)
    if (saved) setCart(JSON.parse(saved))
    const getJson = async <T,>(url: string, label: string) => {
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        let detail = ''
        try { detail = String((await response.json()).detail ?? '') } catch { /* response may not be JSON */ }
        throw new Error(`${label}${detail ? `: ${detail}` : ` (HTTP ${response.status})`}`)
      }
      return response.json() as Promise<T>
    }
    ;(async () => {
      try {
        const restaurantData = await getJson<Restaurant>(`${API}/public/restaurants/${encodeURIComponent(restaurantSlug)}`, 'Restaurant unavailable')
        const tableData = await getJson<Table>(`${API}/public/restaurants/${encodeURIComponent(restaurantSlug)}/tables/${encodeURIComponent(tableId)}`, 'Table unavailable')
        const menuData = await getJson<{ categories: Category[]; items: MenuItem[] }>(`${API}/public/restaurants/${encodeURIComponent(restaurantSlug)}/menu`, 'Menu unavailable')
        setRestaurant(restaurantData); setTable(tableData); setCategories(menuData.categories); setItems(menuData.items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load this table')
      } finally {
        setLoading(false)
      }
    })()
  }, [restaurantSlug, tableId])

  useEffect(() => { window.localStorage.setItem(`qrserve-cart-${restaurantSlug}-${tableId}`, JSON.stringify(cart)) }, [cart, restaurantSlug, tableId])

  const filtered = useMemo(() => items.filter(item => (activeCategory === 'all' || item.category_id === activeCategory) && `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query.toLowerCase())), [items, activeCategory, query])
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const tax = subtotal * 0.08875
  const total = subtotal + tax
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)
  const changeQuantity = (item: MenuItem, delta: number) => setCart(current => { const found = current.find(line => line.id === item.id); if (!found && delta > 0) return [...current, { ...item, quantity: 1 }]; return current.map(line => line.id === item.id ? { ...line, quantity: line.quantity + delta } : line).filter(line => line.quantity > 0) })
  const placeOrder = async () => { setError(''); const response = await fetch(`${API}/public/restaurants/${restaurantSlug}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_id: tableId, items: cart.map(line => ({ menu_item_id: line.id, quantity: line.quantity })) }) }); if (!response.ok) { setError((await response.json()).detail ?? 'Unable to place order'); return }; setOrder(await response.json()); setCart([]); setCheckout(false); setCartOpen(false) }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-muted-foreground">Loading menu...</main>
  if (error && !restaurant) return <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center"><div><Utensils className="mx-auto size-10 text-terracotta" /><h1 className="mt-4 font-display text-2xl font-bold">Menu unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p></div></main>
  if (order) return <OrderConfirmation order={order} currency={restaurant?.currency ?? 'USD'} />
  return <main className="min-h-screen bg-background pb-28"><header className="border-b border-border bg-card px-5 pb-5 pt-8"><div className="mx-auto max-w-xl"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">QRServe</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight">{restaurant?.name}</h1><p className="mt-1 text-sm text-muted-foreground">{table?.table_number} · Order from your table</p></div><div className="flex size-12 items-center justify-center rounded-2xl bg-terracotta/10 text-terracotta"><Utensils className="size-6" /></div></div><div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search the menu" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div></div></header><section className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-3 backdrop-blur"><div className="mx-auto flex max-w-xl gap-2 overflow-x-auto"><button onClick={() => setActiveCategory('all')} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activeCategory === 'all' ? 'bg-ink text-primary-foreground' : 'bg-card text-muted-foreground'}`}>All</button>{categories.map(category => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activeCategory === category.id ? 'bg-ink text-primary-foreground' : 'bg-card text-muted-foreground'}`}>{category.name}</button>)}</div></section><section className="mx-auto flex max-w-xl flex-col gap-3 px-5 py-6"><MenuAssistant restaurantSlug={restaurantSlug} currency={restaurant?.currency ?? 'INR'} onAdd={item => changeQuantity(item, 1)} />{filtered.length ? filtered.map(item => <article key={item.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4"><div className="min-w-0 flex-1"><h2 className="font-display text-lg font-bold">{item.name}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description || 'Prepared fresh to order.'}</p><p className="mt-3 font-semibold text-terracotta">{money(item.price, restaurant?.currency)}</p></div><div className="flex flex-col items-end justify-between"><div className="flex size-20 items-center justify-center rounded-xl bg-amber/20 text-amber-foreground"><Utensils className="size-6" /></div><button onClick={() => changeQuantity(item, 1)} className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-2 text-xs font-bold text-primary-foreground"><Plus className="size-3" />Add</button></div></article>) : <p className="py-16 text-center text-sm text-muted-foreground">No available items match your search.</p>}</section>{count > 0 && <button onClick={() => setCartOpen(true)} className="fixed bottom-5 left-1/2 z-20 flex w-[calc(100%-2.5rem)] max-w-xl -translate-x-1/2 items-center justify-between rounded-2xl bg-terracotta px-5 py-4 text-primary-foreground shadow-xl"><span className="flex items-center gap-2 font-bold"><ShoppingBag className="size-5" />View order <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">{count}</span></span><span className="font-bold">{money(total, restaurant?.currency)}</span></button>}{cartOpen && <CartDrawer cart={cart} subtotal={subtotal} tax={tax} total={total} currency={restaurant?.currency ?? 'USD'} onChange={changeQuantity} onClose={() => setCartOpen(false)} onCheckout={() => { setCartOpen(false); setCheckout(true) }} />}{checkout && <Checkout total={total} currency={restaurant?.currency ?? 'USD'} payment={payment} setPayment={setPayment} error={error} onBack={() => setCheckout(false)} onPlace={placeOrder} />}</main>
}

function CartDrawer({ cart, subtotal, tax, total, currency, onChange, onClose, onCheckout }: { cart: CartLine[]; subtotal: number; tax: number; total: number; currency: string; onChange: (item: MenuItem, delta: number) => void; onClose: () => void; onCheckout: () => void }) { return <div className="fixed inset-0 z-30 bg-ink/30"><section className="absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl bg-card p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Your order</h2><button onClick={onClose} aria-label="Close order"><X className="size-5" /></button></div><div className="mt-5 flex max-h-64 flex-col gap-4 overflow-auto">{cart.map(item => <div key={item.id} className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{money(Number(item.price) * item.quantity, currency)}</p></div><div className="flex items-center gap-3 rounded-full bg-muted px-2 py-1"><button onClick={() => onChange(item, -1)} aria-label={`Remove one ${item.name}`}><Minus className="size-4" /></button><span className="w-4 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => onChange(item, 1)} aria-label={`Add one ${item.name}`}><Plus className="size-4" /></button></div></div>)}</div><div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 text-sm"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(subtotal, currency)}</span></div><div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(tax, currency)}</span></div><div className="mt-2 flex justify-between text-base font-bold"><span>Total</span><span>{money(total, currency)}</span></div></div><button onClick={onCheckout} className="mt-5 w-full rounded-xl bg-ink py-3.5 font-bold text-primary-foreground">Continue to checkout</button></section></div> }

function Checkout({ total, currency, payment, setPayment, error, onBack, onPlace }: { total: number; currency: string; payment: string; setPayment: (value: string) => void; error: string; onBack: () => void; onPlace: () => void }) { return <div className="fixed inset-0 z-30 overflow-auto bg-background"><section className="mx-auto max-w-xl p-5 pt-8"><button onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft className="size-4" />Back to order</button><p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Checkout</p><h2 className="mt-2 font-display text-3xl font-bold">How would you like to pay?</h2><div className="mt-8 flex flex-col gap-3"><button onClick={() => setPayment('pay-at-table')} className={`rounded-2xl border p-4 text-left ${payment === 'pay-at-table' ? 'border-terracotta bg-terracotta/10' : 'border-border bg-card'}`}><p className="font-bold">Pay at table</p><p className="mt-1 text-sm text-muted-foreground">Settle with your server when you&apos;re ready.</p></button><button onClick={() => setPayment('card')} className={`rounded-2xl border p-4 text-left ${payment === 'card' ? 'border-terracotta bg-terracotta/10' : 'border-border bg-card'}`}><p className="font-bold">Pay by card</p><p className="mt-1 text-sm text-muted-foreground">Payment processing can be connected to your provider.</p></button></div>{error && <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<button onClick={onPlace} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta py-4 font-bold text-primary-foreground">Place order · {money(total, currency)}<ChevronRight className="size-4" /></button></section></div> }

function OrderConfirmation({ order, currency }: { order: Order; currency: string }) { return <main className="flex min-h-screen items-center justify-center bg-background p-5"><section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 text-center"><div className="mx-auto flex size-16 items-center justify-center rounded-full bg-sage/15 text-sage-foreground"><Check className="size-8" /></div><p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-terracotta">Order received</p><h1 className="mt-2 font-display text-3xl font-bold">Thanks for ordering.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your order <strong>#{order.order_number}</strong> is now {order.status}. We&apos;ll keep you posted as it moves through the kitchen.</p><div className="mt-7 rounded-2xl bg-muted p-4 text-left"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Total</span><strong>{money(order.total, currency)}</strong></div><div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Status</span><strong className="capitalize">{order.status}</strong></div></div></section></main> }
