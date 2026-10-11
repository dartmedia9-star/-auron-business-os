import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 ease-[var(--ease-spring)] hover:-translate-y-px active:translate-y-0 active:scale-[0.96] active:duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.32),0_1px_2px_rgb(0_0_0/0.18)] hover:bg-primary/92 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.32),0_8px_22px_-10px_hsl(var(--gold)/0.75)]",
        destructive:
          "bg-destructive-solid text-destructive-foreground shadow-xs hover:bg-destructive-solid/90",
        outline:
          "border border-border bg-card shadow-[var(--glass-highlight),var(--elev-0)] hover:border-foreground/20 hover:bg-surface-2 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-[hsl(var(--state-hover))] hover:text-foreground active:bg-[hsl(var(--state-pressed))]",
        link: "text-gold-ink underline-offset-4 hover:underline hover:translate-y-0 active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
  /** Briefly shows a check after a save succeeded (see useFlash). */
  success?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, success = false, disabled, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      )
    }
    return (
      <button
        className={cn(
          buttonVariants({ variant, size, className }),
          // Saved: the button briefly turns green with a check (see useFlash).
          success && !loading && "border-transparent bg-success text-success-foreground hover:bg-success",
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : success ? (
          <Check className="mr-1.5 h-4 w-4 animate-pop-in" aria-hidden />
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
