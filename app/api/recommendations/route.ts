import { generateText, Output } from 'ai'
import { z } from 'zod'

const recommendationSchema = z.object({
  message: z.string(),
  recommendations: z.array(z.object({
    id: z.string(),
    reason: z.string(),
  })).max(5),
})

export async function POST(request: Request) {
  const body = await request.json() as { restaurantSlug?: string; query?: string }
  const restaurantSlug = body.restaurantSlug?.trim()
  const query = body.query?.trim()
  if (!restaurantSlug || !query || query.length > 500) return Response.json({ detail: 'Restaurant and request are required.' }, { status: 400 })

  const origin = new URL(request.url).origin
  const menuResponse = await fetch(`${origin}/api/public/restaurants/${encodeURIComponent(restaurantSlug)}/menu`, { cache: 'no-store' })
  if (!menuResponse.ok) return Response.json({ detail: 'The live menu is unavailable.' }, { status: 502 })
  const menu = await menuResponse.json() as { categories: Array<{ id: string; name: string }>; items: Array<{ id: string; category_id?: string | null; name: string; description?: string | null; price: string }> }
  if (!menu.items.length) return Response.json({ message: 'There are no available menu items to recommend right now.', recommendations: [] })

  const categoryNames = new Map(menu.categories.map(category => [category.id, category.name]))
  const catalog = menu.items.map(item => ({ id: item.id, name: item.name, price: item.price, category: item.category_id ? categoryNames.get(item.category_id) ?? null : null, description: item.description ?? '' }))
  const { output } = await generateText({
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    output: Output.object({ schema: recommendationSchema }),
    system: 'You are QRServe menu assistant. Recommend only items from the provided AVAILABLE catalog. Never invent names, ids, prices, ingredients, dietary labels, or availability. If the request cannot be satisfied, return an empty recommendations array and explain briefly. Use the exact catalog ids for recommendations.',
    prompt: `Customer request: ${query}\n\nAVAILABLE CATALOG (source of truth):\n${JSON.stringify(catalog)}`,
  })
  const validIds = new Set(menu.items.map(item => item.id))
  const safeRecommendations = output.recommendations.filter(item => validIds.has(item.id)).slice(0, 5)
  const byId = new Map(menu.items.map(item => [item.id, item]))
  return Response.json({ message: output.message, recommendations: safeRecommendations.map(item => ({ ...item, item: byId.get(item.id) })) })
}
