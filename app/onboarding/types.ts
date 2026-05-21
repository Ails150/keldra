export type OrgEntry = {
  id: string;
  name: string;
  role: string;
  initials: string;
  colour: string;
  isYou?: boolean;
};

export type InviteEntry = {
  id: string;
  name: string;
  email: string;
  org: string;
  role: string;
  initials: string;
  colour: string;
};

export type WizardData = {
  phase: string | null;
  org: {
    name: string;
    type: string | null;
    colour: string;
  };
  project: {
    name: string;
    client: string;
    sector: string;
    startDate: string;
    handoverDate: string;
    buildType: string | null;
    location: string;
  };
  otherOrgs: OrgEntry[];
  template: string | null;
  uploads: {
    team: boolean;
    assets: boolean;
    constraints: boolean;
  };
  invites: InviteEntry[];
};

export type StepProps = {
  formData: WizardData;
  setFormData: (updater: (prev: WizardData) => WizardData) => void;
  onNext: () => void;
  onPrev: () => void;
  jumpTo?: (step: number) => void;
};
