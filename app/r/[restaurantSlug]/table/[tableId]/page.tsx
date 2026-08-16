import CustomerOrderingFlow from '@/components/customer-ordering-flow'

export default async function CustomerMenuPage({ params }: { params: Promise<{ restaurantSlug: string; tableId: string }> }) {
  const { restaurantSlug, tableId } = await params
  return <CustomerOrderingFlow restaurantSlug={restaurantSlug} tableId={tableId} />
}
