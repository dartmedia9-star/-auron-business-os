import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatMoney } from "./money"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ₹10,000.00: the app-wide money format (see lib/money.ts). */
export function formatCurrency(amount: number | string | null | undefined): string {
  return formatMoney(amount)
}

export function formatPercentage(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${value.toFixed(1)}%`
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
