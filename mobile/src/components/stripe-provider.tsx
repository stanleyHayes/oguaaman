import type { ReactNode } from "react";
import { StripeProvider } from "@stripe/stripe-react-native";

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

/** Native: wraps the tree in Stripe's provider when a publishable key is set;
 *  otherwise renders children bare so the app works without Stripe config. */
export function AppStripeProvider({ children }: Readonly<{ children: ReactNode }>) {
  if (!STRIPE_PK) return <>{children}</>;
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="gh.oguaa.app.stripe">
      {children}
    </StripeProvider>
  );
}
