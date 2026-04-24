import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCompletionColor(percentage: number): string {
  if (percentage >= 80) return 'text-green-600 bg-green-100'
  if (percentage >= 60) return 'text-yellow-600 bg-yellow-100'
  return 'text-red-600 bg-red-100'
}

export function getCompletionBorderColor(percentage: number): string {
  if (percentage >= 80) return 'border-green-500'
  if (percentage >= 60) return 'border-yellow-500'
  return 'border-red-500'
}

export function getCompletionBarColor(percentage: number): string {
  if (percentage >= 80) return 'bg-green-500'
  if (percentage >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getBatchName(batchId: number): string {
  const names: Record<number, string> = {
    48: 'دفعة 48',
    46: 'دفعة 46',
    44: 'دفعة 44',
    42: 'دفعة 42',
  }
  return names[batchId] || `دفعة ${batchId}`
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'نشط',
    suspended: 'متعثر',
    graduated: 'متخرج',
    present: 'حاضر',
    absent: 'غائب',
    late: 'متأخر',
    paid: 'مسدد',
    partial: 'جزئي',
    pending: 'متأخر',
    exempt: 'معفى',
    memorized: 'محفوظ',
    in_progress: 'قيد الحفظ',
    failed: 'متعثر',
    not_started: 'لم يبدأ',
    open: 'مفتوح',
    closed: 'مغلق',
    upcoming: 'قادم',
    ongoing: 'جارٍ',
    completed: 'منتهي',
  }
  return labels[status] || status
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    graduated: 'bg-blue-100 text-blue-800',
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-800',
    late: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    partial: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-red-100 text-red-800',
    exempt: 'bg-blue-100 text-blue-800',
    memorized: 'bg-green-100 text-green-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800',
    not_started: 'bg-gray-100 text-gray-600',
    open: 'bg-blue-100 text-blue-800',
    closed: 'bg-gray-100 text-gray-800',
    upcoming: 'bg-blue-100 text-blue-800',
    ongoing: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}
