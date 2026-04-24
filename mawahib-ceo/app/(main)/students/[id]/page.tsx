import StudentDetailClient from './StudentDetailClient'

// Allow any student ID - not just pre-built ones
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StudentDetailClient id={id} />
}
