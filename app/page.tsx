'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, LayoutDashboard, QrCode, Receipt, RefreshCw, Utensils } from 'lucide-react'

type Summary = { orders_today: number; active_orders: number; revenue_today: string; average_order: string }
type Order = { id: string; order_number: string; status: string; total: string; created_at: string }

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const load = async () => {
    setError('')
    const [summaryResponse, ordersResponse] = await Promise.all([fetch('/api/dashboard/summary'), fetch('/api/orders')])
    if (!summaryResponse.ok || !ordersResponse.ok) { setError('Connect an owner session to view live restaurant data.'); return }
    setSummary(await summaryResponse.json())
    setOrders(await ordersResponse.json())
  }
  useEffect(() => { load() }, [])
  const statCards = summary ? [['Orders today', summary.orders_today], ['Active orders', summary.active_orders], ['Revenue today', `$${Number(summary.revenue_today).toFixed(2)}`], ['Average order', `$${Number(summary.average_order).toFixed(2)}`]] : []
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-5"><div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-terracotta text-primary-foreground"><QrCode className="size-5" /></div><div><p className="font-display text-xl font-bold">QRServe</p><p className="text-xs text-muted-foreground">Live restaurant operations</p></div></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"><RefreshCw className="size-4" />Refresh</button></div></header>
      <section className="mx-auto max-w-6xl px-6 py-10"><div className="flex flex-col gap-2"><p className="text-sm font-semibold text-terracotta">Owner workspace</p><h1 className="font-display text-4xl font-bold tracking-tight">Your live restaurant data</h1><p className="max-w-xl text-sm leading-6 text-muted-foreground">This dashboard is connected to the FastAPI service and Neon database. It intentionally shows no invented metrics or sample orders.</p></div>
        {error ? <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8"><LayoutDashboard className="size-8 text-terracotta" /><h2 className="mt-4 font-display text-xl font-bold">No live session connected</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{error} Customer ordering is available directly from a table QR URL without login.</p><a href="/r/your-restaurant/table/your-table-id" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-terracotta bg-terracotta px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-terracotta/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Open customer flow <ExternalLink className="size-4" /></a></div> : summary && <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{statCards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-display text-3xl font-bold">{value}</p></div>)}</div>
          <div className="mt-8 rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border p-5"><Receipt className="size-5 text-terracotta" /><div><h2 className="font-display text-lg font-bold">Live order queue</h2><p className="text-sm text-muted-foreground">Fetched from Neon</p></div></div>{orders.length ? orders.map(order => <div key={order.id} className="flex items-center justify-between border-b border-border px-5 py-4 last:border-0"><div><p className="font-bold">#{order.order_number}</p><p className="text-sm capitalize text-muted-foreground">{order.status}</p></div><p className="font-bold">${Number(order.total).toFixed(2)}</p></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No orders have been recorded yet.</div>}</div>
        </>}
      </section><footer className="mx-auto flex max-w-6xl gap-3 px-6 pb-10 text-sm text-muted-foreground"><Utensils className="size-4" />Menu data is served from the connected backend.</footer>
    </main>
  )
}
