import { LegalPageLayout } from '../components/LegalPageLayout'

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy">
      <p>
        This Privacy Policy describes how <strong>Genocide AI</strong> collects,
        uses, and protects your information when you use our websites, apps, and
        related services (“Services”). By using Genocide AI, you agree to this
        Privacy Policy alongside our Terms &amp; Conditions.
      </p>
      <p>
        Genocide AI is operated for demonstration and experimentation purposes,
        depending on how you configure the application. Practices may vary across
        environments; this Policy describes typical processing.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          Account and profile details you submit (such as identifiers you choose).
        </li>
        <li>
          Conversations or prompts you send through the chat interface, plus
          related metadata (timestamps, device type, coarse location if enabled by
          you or your administrator).
        </li>
        <li>
          Technical logs (IP address, browser or app version, error reports) needed
          to operate and secure the Services.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To provide responses, personalization, and support.</li>
        <li>To improve models, reliability, and safety guardrails.</li>
        <li>To detect abuse, fraud, security incidents, and legal compliance.</li>
        <li>
          With your consent where required—for example newsletters or analytics
          beyond essential operation.
        </li>
      </ul>

      <h2>Legal bases</h2>
      <p>
        Where GDPR or similar frameworks apply, we rely on contractual necessity,
        legitimate interests balanced against your rights (for example securing
        the platform), consent where opted in, or legal obligations.
      </p>

      <h2>Retention</h2>
      <p>
        We retain data only as long as needed for the purposes above, dispute
        resolution, or legal retention requirements. Operational backups may linger
        for a limited grace period before secure deletion or anonymization.
      </p>

      <h2>Sharing</h2>
      <ul>
        <li>
          Subprocessors that host infrastructure, models, observability, or
          moderation under strict agreements.
        </li>
        <li>Authorities when compelled by lawful process.</li>
        <li>A successor entity in an acquisition consistent with notice rules.</li>
      </ul>
      <p>We do not sell your personal information for money as traditionally defined.</p>

      <h2>Your rights</h2>
      <p>
        Depending on your region, you may request access, correction, deletion,
        restriction, portability, or objection—subject to exemptions. Appeals and
        authorized agents may apply where statutes allow.
      </p>

      <h2>Security</h2>
      <p>
        We maintain administrative, technical, and organizational measures
        reasonably designed to protect information. No transmission or storage is
        completely secure; notify us promptly of suspected compromise.
      </p>

      <h2>International transfers</h2>
      <p>
        If data crosses borders, we use appropriate safeguards—such as contracts
        approved by regulators or equivalent mechanisms—for transfers from the EEA,
        UK, Switzerland, or other regions with localization rules.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies or similar tech for essential functioning, remembering
        preferences, and—with consent—analytics. Control via browser settings and
        our cookie banner where available.
      </p>

      <h2>Children</h2>
      <p>
        Genocide AI is not directed to children under thirteen (or older where a
        higher age applies locally). If you believe a minor provided data by
        mistake, please contact us to remove it where feasible.
      </p>

      <h2>Updates</h2>
      <p>
        Material changes prompt reasonable notice—for example refreshed effective
        dates and summaries. Continuing use constitutes acceptance absent a
        required opt‑in pathway.
      </p>

      <h2>Contact</h2>
      <p>
        Questions under this Privacy Policy: contact the operator of your Genocide
        AI deployment or{' '}
        <a className="text-zinc-200 underline underline-offset-2 hover:text-white" href="mailto:privacy@example.com">
          privacy@example.com
        </a>{' '}
        (substitute enterprise contact supplied by administrators).
      </p>
    </LegalPageLayout>
  )
}