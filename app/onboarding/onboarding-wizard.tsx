"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { WizardData, ViewingRole } from "./types";
import Step1Phase from "./steps/step-1-phase";
import Step2Organisation from "./steps/step-2-organisation";
import Step3Project from "./steps/step-3-project";
import Step4Orgs from "./steps/step-4-orgs";
import Step5Templates from "./steps/step-5-templates";
import Step6Invites from "./steps/step-6-invites";

const INITIAL: WizardData = {
  phase: null,
  org: { name: "", type: null, colour: "#8a3dd6" },
  project: {
    name: "MER Cx",
    client: "Hyperscale Client",
    sector: "",
    startDate: "",
    handoverDate: "",
    buildType: null,
    location: "",
  },
  otherOrgs: [
    { id: "mer", name: "Main Contractor", role: "Main contractor", initials: "ARD", colour: "#dc2626", isYou: true },
    { id: "ard", name: "MEP Sub", role: "Subcontractor", initials: "CTL", colour: "#2563eb" },
    { id: "cen", name: "Design Studio", role: "Design house", initials: "CEN", colour: "#16a34a" },
    { id: "pri", name: "Power Sub", role: "Subcontractor", initials: "PRI", colour: "#ea580c" },
    { id: "cli", name: "Hyperscaler X", role: "Client", initials: "CLI", colour: "#0891b2" },
  ],
  template: "main-contractor-red-tag",
  uploads: { team: null, assets: null, constraints: null, register: null, xer: null },
  invites: [
    { id: "1", name: "Commissioning Lead", email: "commissioning.lead@contractor.example", org: "Main Contractor", role: "Commissioning lead", initials: "JM", colour: "#dc2626" },
    { id: "2", name: "Site Manager", email: "site.manager@contractor.example", org: "Main Contractor", role: "Site manager", initials: "TW", colour: "#dc2626" },
    { id: "3", name: "Design Coordinator", email: "design.coord@contractor.example", org: "Main Contractor", role: "Project lead", initials: "LB", colour: "#2563eb" },
    { id: "4", name: "Design Engineer", email: "design.eng@design-studio.example", org: "Design Studio", role: "Design lead", initials: "CM", colour: "#16a34a" },
    { id: "5", name: "Power Cx Engineer", email: "sponsor@hyperscalerx.com", org: "Client", role: "Project sponsor", initials: "SK", colour: "#0891b2" },
  ],
  viewingAs: {
    orgName: "Main Contractor",
    orgType: "main-contractor",
    role: "main-contractor",
  },
};

function deriveViewingRole(orgType: string | null): ViewingRole {
  switch (orgType) {
    case "main-contractor":
    case "gc":
      return "main-contractor";
    case "subcontractor":
    case "commissioning":
      return "subcontractor";
    case "client":
      return "client";
    case "design":
      return "design";
    default:
      return "originating";
  }
}

const STEP_LABELS = [
  "Phase",
  "Your organisation",
  "Project",
  "Other organisations",
  "Templates & data",
  "Invites",
];

export default function OnboardingWizard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardData>(INITIAL);

  const totalSteps = 6;

  // Keep viewingAs in sync with the org the user entered in step 2.
  useEffect(() => {
    setFormData((prev) => {
      const desiredName = prev.org.name.trim() || "Main Contractor";
      const desiredType = prev.org.type ?? "main-contractor";
      const desiredRole = deriveViewingRole(prev.org.type);
      if (
        prev.viewingAs.orgName === desiredName &&
        prev.viewingAs.orgType === desiredType &&
        prev.viewingAs.role === desiredRole
      ) {
        return prev;
      }
      return {
        ...prev,
        viewingAs: { orgName: desiredName, orgType: desiredType, role: desiredRole },
      };
    });
  }, [formData.org.name, formData.org.type]);

  function persist(data: WizardData) {
    try {
      localStorage.setItem("keldra_demo_project", JSON.stringify(data));
    } catch {
      // localStorage may be unavailable (e.g. private mode) — fine for a demo.
    }
  }

  async function next() {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      return;
    }
    // Last step. An authenticated org admin creates REAL records (project,
    // tasks, emailed invites) and lands on their real DB dashboard — no
    // invented numbers. The anonymous demo wizard keeps the localStorage path.
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("users")
          .select("org_id, role")
          .eq("id", user.id)
          .maybeSingle();
        if (prof?.org_id && (prof.role === "org_admin" || prof.role === "superadmin")) {
          await fetch("/api/onboarding/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectName: formData.project.name,
              invites: (formData.invites ?? []).map((i) => ({ email: i.email, role: i.role })),
            }),
          });
          window.location.assign("/dashboard");
          return;
        }
      }
    } catch {
      /* fall through to the demo path */
    }
    persist(formData);
    router.push("/onboarding/done");
  }

  function prev() {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  }

  function jumpTo(step: number) {
    if (step >= 1 && step <= currentStep) setCurrentStep(step);
  }

  const stepProps = { formData, setFormData, onNext: next, onPrev: prev, jumpTo };

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-paper-line bg-paper/80 backdrop-blur">
        <div
          className="mx-auto flex items-center justify-between px-8 py-4"
          style={{ maxWidth: 1600 }}
        >
          <div className="flex items-baseline gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                  style={{ fontSize: 22, lineHeight: 1 }}
                >
                  Keldra<span style={{ color: "var(--accent)" }}>.</span>
                </span>
                <span className="text-sm text-ink-mid">
                  · Set up your project
                </span>
              </div>
              <span
                className="font-mono font-semibold uppercase text-accent-deep"
                style={{
                  fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                }}
              >
                See · Solve · Scale
              </span>
            </div>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-paper font-semibold text-sm"
            title={userEmail}
          >
            {userInitial}
          </div>
        </div>

        <div
          className="mx-auto px-8 pb-5"
          style={{ maxWidth: 1600 }}
        >
          <div className="flex items-center justify-between gap-3">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => {
              const isActive = n === currentStep;
              const isDone = n < currentStep;
              const clickable = n <= currentStep;
              return (
                <div key={n} className="flex flex-1 items-center gap-3">
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => jumpTo(n)}
                    className={`flex items-center gap-2 transition-opacity ${
                      clickable ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        isActive
                          ? "bg-accent text-paper"
                          : isDone
                          ? "bg-accent-deep text-paper"
                          : "bg-paper-line text-ink-mid"
                      }`}
                    >
                      {isDone ? "✓" : n}
                    </span>
                    <span
                      className={`hidden text-xs font-medium md:inline ${
                        isActive ? "text-ink" : "text-ink-mid"
                      }`}
                    >
                      {STEP_LABELS[n - 1]}
                    </span>
                  </button>
                  {n < totalSteps && (
                    <div
                      className={`h-px flex-1 ${
                        n < currentStep ? "bg-accent-deep" : "bg-paper-line"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 py-10">
        {currentStep === 1 && <Step1Phase {...stepProps} />}
        {currentStep === 2 && <Step2Organisation {...stepProps} />}
        {currentStep === 3 && <Step3Project {...stepProps} />}
        {currentStep === 4 && <Step4Orgs {...stepProps} />}
        {currentStep === 5 && <Step5Templates {...stepProps} />}
        {currentStep === 6 && <Step6Invites {...stepProps} />}
      </main>

      <footer className="sticky bottom-0 border-t border-paper-line bg-paper-card">
        <div
          className="mx-auto flex items-center justify-between gap-3 px-8 py-4"
          style={{ maxWidth: 1600 }}
        >
          <button
            type="button"
            onClick={prev}
            disabled={currentStep === 1}
            className="rounded-xl border border-paper-line bg-paper-card px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-warm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Back
          </button>

          <div className="flex items-center gap-3">
            {(currentStep === 5 || currentStep === 6) && (
              <button
                type="button"
                onClick={next}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-mid transition-colors hover:text-ink"
              >
                Skip for now
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-xl bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent"
            >
              {currentStep === totalSteps ? "Finish setup →" : "Continue →"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
