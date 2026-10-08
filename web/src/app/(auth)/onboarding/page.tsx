import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Onboarding" };

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <PlaceholderPage
        title="Onboarding"
        description="Workspace, default profile, optional API credentials, scope confirmation, first scan."
        route="/onboarding"
      />
    </div>
  );
}
