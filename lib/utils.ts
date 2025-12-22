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
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  
  return `INV${year}${month}${day}${random}`
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

export function createDateFolder(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}`
}
