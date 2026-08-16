import { generateText } from 'ai'

export async function POST(request: Request) {
  const body = await request.json() as { question?: string; analytics?: unknown }
  const question = body.question?.trim()
  if (!question || question.length > 500) return Response.json({ detail: 'Ask a question about your restaurant analytics.' }, { status: 400 })
  if (!body.analytics) return Response.json({ detail: 'Analytics data is required.' }, { status: 400 })

  const { text } = await generateText({
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    system: 'You are QRServe Insights. Answer only from the verified analytics JSON provided. Never invent metrics, dates, menu items, trends, or recommendations. If the data is empty or insufficient, say so clearly. Keep answers concise and actionable for a restaurant owner.',
    prompt: `Question: ${question}\n\nVERIFIED ANALYTICS JSON:\n${JSON.stringify(body.analytics)}`,
  })
  return Response.json({ answer: text })
}
