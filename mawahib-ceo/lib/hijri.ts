export function toHijriDisplay(gregorianDateStr: string): string {
  if (!gregorianDateStr) return ''
  try {
    const date = new Date(gregorianDateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return gregorianDateStr
  }
}

export function toHijriShort(gregorianDateStr: string): string {
  if (!gregorianDateStr) return ''
  try {
    const date = new Date(gregorianDateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).format(date)
  } catch {
    return gregorianDateStr
  }
}

export function toGregorianDisplay(gregorianDateStr: string): string {
  if (!gregorianDateStr) return ''
  try {
    const date = new Date(gregorianDateStr + 'T12:00:00')
    return new Intl.DateTimeFormat('ar-SA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  } catch {
    return gregorianDateStr
  }
}

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

export function formatDateBoth(gregorianDateStr: string): { hijri: string; gregorian: string } {
  return {
    hijri: toHijriDisplay(gregorianDateStr),
    gregorian: toGregorianDisplay(gregorianDateStr),
  }
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
