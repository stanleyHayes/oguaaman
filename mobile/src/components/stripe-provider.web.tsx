import type { ReactNode } from "react";

/** Web: the native Stripe SDK can't run here, so this is a passthrough —
 *  web payments go through Paystack's hosted checkout (see lib/payments.web.ts). */
export function AppStripeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
