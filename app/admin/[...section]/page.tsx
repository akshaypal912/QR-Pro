import AdminWorkspace from '@/components/admin-workspace'

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string[] }> }) {
  const { section } = await params
  return <AdminWorkspace section={section[0] ?? 'dashboard'} />
}
