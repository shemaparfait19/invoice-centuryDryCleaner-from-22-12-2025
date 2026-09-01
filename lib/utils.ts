import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-RW', {
    style: 'currency',
    currency: 'RWF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function generateInvoiceId(): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  // 6 digits (1M possibilities/day) instead of 3 (1,000/day) — makes a
  // same-day collision astronomically unlikely. addInvoice() also retries
  // with a fresh id on the rare case Postgres still rejects it as a
  // duplicate key, so a collision can never silently corrupt data.
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')

  return `INV${year}${month}${day}${random}`
}

// Normalizes a phone number down to its significant digits so different
// formats of the same number match: "0788123456", "+250788123456", and
// "250 788 123 456" all normalize to "788123456". Used for both loose
// client search and duplicate-client detection.
export function normalizePhoneForMatch(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('250')) digits = digits.slice(3)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

export function formatPhoneNumber(phone: string): string {
  // Ensure phone starts with +250
  if (!phone.startsWith('+250')) {
    if (phone.startsWith('250')) {
      return '+' + phone
    } else if (phone.startsWith('0')) {
      return '+250' + phone.slice(1)
    } else {
      return '+250' + phone
    }
  }
  return phone
}

// Converts a 24-hour "HH:MM" (or "HH:MM:SS") string, as stored from an
// <input type="time"> or the database, into a 12-hour "h:mm AM/PM" string.
export function formatTime(time?: string | null): string {
  if (!time) return ""
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

// Formats a Date as a local-timezone "YYYY-MM-DD" string. Prefer this over
// `date.toISOString().split('T')[0]` for "today's date" — toISOString
// converts to UTC first, which silently returns YESTERDAY's date for a
// couple of hours after local midnight in any timezone ahead of UTC
// (e.g. Kigali, UTC+2). That bug is what caused invoices created just
// after midnight to get dated (and reported) as the previous day.
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const d = date.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function createDateFolder(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}`
}
