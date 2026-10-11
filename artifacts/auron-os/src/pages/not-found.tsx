import { Link } from 'wouter';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
      <div className="glass flex w-full max-w-md animate-fade-up flex-col items-center rounded-3xl px-6 py-10 text-center">
        <span className="flex h-12 w-12 animate-pop-in items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Compass className="h-6 w-6" />
        </span>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-gold-ink">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This address doesn't match any page in Auron Business OS.
        </p>
        <Button asChild className="mt-6 rounded-full">
          <Link href="/dashboard">Back to Command Center</Link>
        </Button>
      </div>
    </div>
  );
}
