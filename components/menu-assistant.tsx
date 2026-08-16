"use client"

import { FormEvent, useState } from 'react'
import { ChefHat, Loader2, Plus, Sparkles } from 'lucide-react'

type RecommendedItem = { id: string; reason: string; name: string; description?: string | null; price: string; item: { id: string; name: string; description?: string | null; price: string } }

export default function MenuAssistant({ restaurantSlug, currency, onAdd }: { restaurantSlug: string; currency: string; onAdd: (item: RecommendedItem['item']) => void }) {
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [recommendations, setRecommendations] = useState<RecommendedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const money = (value: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value))
  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setLoading(true); setError(''); setRecommendations([])
    try {
      const response = await fetch('/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantSlug, query }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail ?? 'Unable to get recommendations')
      setMessage(data.message); setRecommendations(data.recommendations ?? [])
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to get recommendations') } finally { setLoading(false) }
  }
  return <section className="rounded-3xl border border-terracotta/20 bg-terracotta/5 p-5">
    <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-terracotta text-primary-foreground"><ChefHat className="size-5" /></div><div><p className="flex items-center gap-2 font-display font-bold">Ask the menu assistant <Sparkles className="size-4 text-terracotta" /></p><p className="mt-1 text-sm text-muted-foreground">Tell me what you&apos;re in the mood for. I&apos;ll only use today&apos;s available menu.</p></div></div>
    <form onSubmit={ask} className="mt-4 flex gap-2"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Something vegetarian under ₹400..." className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-terracotta" /><button disabled={loading} className="flex shrink-0 items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">{loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Ask</button></form>
    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    {message && <p className="mt-4 text-sm leading-6 text-foreground">{message}</p>}
    {recommendations.length > 0 && <div className="mt-4 flex flex-col gap-2">{recommendations.map(recommendation => <div key={recommendation.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"><div className="min-w-0 flex-1"><p className="font-semibold">{recommendation.item.name}</p><p className="text-xs text-muted-foreground">{money(recommendation.item.price)} · {recommendation.reason}</p></div><button onClick={() => onAdd(recommendation.item)} aria-label={`Add ${recommendation.item.name} to cart`} className="flex size-9 items-center justify-center rounded-full bg-terracotta text-primary-foreground"><Plus className="size-4" /></button></div>)}</div>}
  </section>
}
