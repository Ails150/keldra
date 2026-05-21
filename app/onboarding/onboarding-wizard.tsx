"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WizardData } from "./types";
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
    name: "",
    client: "",
    sector: "",
    startDate: "",
    handoverDate: "",
    buildType: null,
    location: "",
  },
  otherOrgs: [
    { id: "mer", name: "Mercury Engineering", role: "Subcontractor (MEP)", initials: "MER", colour: "#dc2626", isYou: true },
    { id: "ard", name: "Ardmac", role: "Subcontractor", initials: "ARD", colour: "#2563eb" },
    { id: "cen", name: "Central Design", role: "Design house", initials: "CEN", colour: "#16a34a" },
    { id: "pri", name: "Primo Power", role: "Subcontractor", initials: "PRI", colour: "#ea580c" },
    { id: "cli", name: "Hyperscaler X", role: "Client", initials: "CLI", colour: "#0891b2" },
  ],
  template: "mercury-red-tag",
  uploads: { team: true, assets: true, constraints: true },
  invites: [
    { id: "1", name: "Johnny McKenna", email: "johnny@mercuryeng.com", org: "Mercury", role: "Commissioning lead", initials: "JM", colour: "#dc2626" },
    { id: "2", name: "Tom Walsh", email: "tom.walsh@mercuryeng.com", org: "Mercury", role: "Site manager", initials: "TW", colour: "#dc2626" },
    { id: "3", name: "Lawrence Burke", email: "l.burke@ardmac.com", org: "Ardmac", role: "Project lead", initials: "LB", colour: "#2563eb" },
    { id: "4", name: "Conor Murphy", email: "conor@centraldesign.ie", org: "Central", role: "Design lead", initials: "CM", colour: "#16a34a" },
    { id: "5", name: "Sarah Kennedy", email: "sarah.k@hyperscalerx.com", org: "Client", role: "Project sponsor", initials: "SK", colour: "#0891b2" },
  ],
};

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

  function next() {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push("/onboarding/done");
    }
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
          <div className="flex items-baseline gap-3">
            <span
              className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
              style={{ fontSize: 22, lineHeight: 1 }}
            >
              Keldra
            </span>
            <span className="text-sm text-ink-mid">· Set up your project</span>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-paper font-semibold text-sm"
            title={userEmail}
          >
            {userInitial}
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-8 pb-5">
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-8 py-4">
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
