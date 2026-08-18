import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—"
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatCompactCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—"
  
  const abs = Math.abs(amount)
  if (abs >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)}Cr`
  }
  if (abs >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`
  }
  
  return formatCurrency(amount)
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
