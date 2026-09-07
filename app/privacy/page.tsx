import type { Metadata } from "next";
import Link from "next/link";
import {
  PRIVACY_POLICY_VERSION,
  PRIVACY_POLICY_EFFECTIVE,
  SUB_PROCESSORS,
  RETENTION_RULES,
} from "@/lib/privacy/policy";

export const metadata: Metadata = {
  title: "Privacy notice · Keldra",
  description:
    "How Keldra handles personal data: what we hold, who processes it, how long we keep it, and how to exercise your rights.",
};

// Public, unauthenticated by design — a privacy notice that only logged-in users
// can read is not a notice. Most of the people described here have no account:
// their details reach Keldra because a contractor emailed them into a task.

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10">
      <h2
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 20, lineHeight: 1.2 }}
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-ink-mid" style={{ fontSize: 15, lineHeight: 1.6 }}>
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12">
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 30, lineHeight: 1.1 }}
      >
        Privacy notice
      </h1>
      <p className="mt-2 text-ink-mid" style={{ fontSize: 14 }}>
        Version {PRIVACY_POLICY_VERSION} · effective {PRIVACY_POLICY_EFFECTIVE}
      </p>

      <div
        className="mt-6 rounded-lg border border-border-soft bg-paper-warm p-4 text-ink-mid"
        style={{ fontSize: 15, lineHeight: 1.6 }}
      >
        <strong className="text-ink">If you are reading this because your name appeared in Keldra:</strong>{" "}
        you probably do not have an account. Contractors use Keldra to track who owes what on a
        construction project, and your name or email address may have been entered by one of them, or
        arrived because you were copied on a project email. You still have rights over that data —{" "}
        <Link href="#your-rights" className="text-accent underline">
          see below
        </Link>
        .
      </div>

      <Section id="who-we-are" title="Who we are">
        <p>
          Keldra is a construction accountability platform. Each customer organisation is the{" "}
          <strong className="text-ink">data controller</strong> for the project data it puts into
          Keldra and for the people it names in that data. Keldra operates as the{" "}
          <strong className="text-ink">processor</strong> acting on that organisation&rsquo;s
          instructions.
        </p>
        <p>
          If you want your data removed and you know which contractor entered it, they are the
          fastest route. If you do not, contact us and we will identify the controlling organisation
          and pass the request on.
        </p>
      </Section>

      <Section id="what-we-hold" title="What we hold">
        <ul className="list-disc space-y-1 pl-5">
          <li>Names, email addresses and job roles of people working on a project.</li>
          <li>
            Records of commissioning work: tasks, blockers, asset tags, gate sign-offs, and who was
            responsible for each.
          </li>
          <li>
            Email sent through and into the platform — sender, recipient, subject, body and
            attachments — where it relates to a tracked task.
          </li>
          <li>Notes, comments and photographs uploaded against site work.</li>
          <li>For account holders: sign-in details and access history.</li>
        </ul>
        <p>
          Keldra does not use personal data for advertising, does not sell it, and does not use
          customer data to train machine-learning models.
        </p>
      </Section>

      <Section id="sub-processors" title="Sub-processors">
        <p>
          These are the third parties that process personal data on Keldra&rsquo;s behalf, the region
          they operate in, and the basis for any transfer outside the UK/EEA.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ fontSize: 14 }}>
            <thead>
              <tr className="border-b border-border-soft">
                <th className="py-2 pr-3 font-semibold text-ink">Processor</th>
                <th className="py-2 pr-3 font-semibold text-ink">Purpose</th>
                <th className="py-2 pr-3 font-semibold text-ink">Region</th>
                <th className="py-2 pr-3 font-semibold text-ink">Data shared</th>
                <th className="py-2 font-semibold text-ink">Transfer basis</th>
              </tr>
            </thead>
            <tbody>
              {SUB_PROCESSORS.map((p) => (
                <tr key={p.name} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3 font-medium text-ink">{p.name}</td>
                  <td className="py-2 pr-3 text-ink-mid">{p.purpose}</td>
                  <td className="py-2 pr-3 text-ink-mid">{p.region}</td>
                  <td className="py-2 pr-3 text-ink-mid">{p.dataShared}</td>
                  <td className="py-2 text-ink-mid">{p.transferBasis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Insight and summary features send project content — including the names of people
          responsible for work — to Google&rsquo;s Gemini API. If your organisation would rather that
          did not happen, those features can be turned off per organisation; ask your administrator.
        </p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <div className="mt-1 overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ fontSize: 14 }}>
            <thead>
              <tr className="border-b border-border-soft">
                <th className="py-2 pr-3 font-semibold text-ink">Data</th>
                <th className="py-2 pr-3 font-semibold text-ink">Kept for</th>
                <th className="py-2 font-semibold text-ink">Notes</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_RULES.map((r) => (
                <tr key={r.category} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3 font-medium text-ink">{r.category}</td>
                  <td className="py-2 pr-3 text-ink-mid">{r.period}</td>
                  <td className="py-2 text-ink-mid">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="your-rights" title="Your rights">
        <p>
          Under UK and EU data protection law you can ask for a copy of your data, ask for it to be
          corrected, ask for it to be erased, object to how it is used, or complain to a supervisory
          authority (in the UK, the Information Commissioner&rsquo;s Office).
        </p>
        <p>
          To exercise any of these, contact the organisation that entered your data, or email us and
          we will route it. We respond within one month.
        </p>
      </Section>

      <Section id="cannot-erase" title="What we cannot erase, and why">
        <p>
          Keldra keeps a tamper-evident record of commissioning decisions: who accepted
          responsibility for a piece of work, who signed off a gate, when a blocker was raised and by
          whom. Those records are append-only and cryptographically chained — each entry is sealed
          against the one before it, so that the record can be trusted months later in a dispute.
        </p>
        <p>
          <strong className="text-ink">
            Editing a name out of that chain would break it, and would defeat the purpose of keeping
            it.
          </strong>{" "}
          So when an erasure request is carried out, we remove contact details, account details,
          rosters, pending invitations and email content — but the accountability record itself is
          retained. We rely on Article 17(3)(e) of the UK/EU GDPR: retention necessary for the
          establishment, exercise or defence of legal claims.
        </p>
        <p>
          Every erasure we perform records exactly what was removed and what was retained, so that
          you can be told precisely what remains rather than being given a vague answer.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          Data is encrypted in transit and at rest. Each organisation&rsquo;s data is isolated at the
          database level, and that isolation is tested by an automated suite that attempts
          cross-organisation access on every audit. Access to production is limited and logged.
        </p>
      </Section>

      <Section id="changes" title="Changes to this notice">
        <p>
          When this notice changes materially we publish a new version number. Consent recorded
          against an earlier version is not treated as agreement to a later one.
        </p>
      </Section>

      <p className="mt-10 text-ink-mid" style={{ fontSize: 13 }}>
        <Link href="/" className="text-accent underline">
          Back to Keldra
        </Link>
      </p>
    </main>
  );
}
