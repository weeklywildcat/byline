import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "../ui/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";

/** A server or load failure that is bigger than one field. Field validation uses FieldError instead. */
export function InlineAlert({ title, children, onAction, actionLabel = "Try again", className }: { title?: ReactNode; children?: ReactNode; onAction?: () => void; actionLabel?: string; className?: string }) {
  return <Alert variant="destructive" className={className}>
    <CircleAlert aria-hidden="true" />
    {title ? <AlertTitle>{title}</AlertTitle> : null}
    {children ? <AlertDescription>{children}</AlertDescription> : null}
    {onAction ? <AlertAction><Button type="button" variant="outline" size="xs" onClick={onAction}>{actionLabel}</Button></AlertAction> : null}
  </Alert>;
}
