import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const Icon = props.variant === 'success' ? CheckCircle2 : props.variant === 'destructive' ? AlertCircle : null;
        return (
          <Toast key={id} {...props}>
            {Icon && <Icon aria-hidden className={props.variant === 'success' ? 'mt-0.5 h-5 w-5 shrink-0 text-success animate-in zoom-in-50 duration-300' : 'mt-0.5 h-5 w-5 shrink-0 text-destructive'} />}
            <div className="grid flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
