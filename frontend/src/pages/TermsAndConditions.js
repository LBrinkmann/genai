import { LegalPageLayout } from '../components/LegalPageLayout'

export default function TermsAndConditions() {
  return (
    <LegalPageLayout title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions (“Terms”) govern access to websites, apps, and
        related services branded <strong>Genocide AI</strong> (“we,” “us,” or Genocide AI).
        By using Genocide AI, you agree to these Terms and our Privacy Policy. If an
        organization provides access to you (for example through your employer),
        additional agreements between that organization and the operator may also apply.
      </p>

      <h2>Use of the service</h2>
      <p>
        Subject to compliance with these Terms, we grant you a limited, revocable,
        non‑exclusive license to access and use Genocide AI as offered. Outputs are
        generated automatically and may be inaccurate or incomplete—you are responsible
        for how you rely on them, review them, or share them outside the Services.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must meet the minimum age and capacity requirements applicable where you live.
        You may not impersonate others, misrepresent your affiliation, sell or transfer your
        access without authorization, or use the Services in violation of export or sanctions law.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Do not use Genocide AI to harm people, threaten violence, sexually exploit minors,
          or engage in unlawful discrimination or harassment.
        </li>
        <li>
          Do not misuse the infrastructure (for example by attacking security, circumventing rate
          limits without permission, scraping in violation of robots or API terms where they apply,
          or attempting to decrypt or misuse others’ conversations).
        </li>
        <li>
          Do not violate third‑party intellectual property rights, contractual duties, privacy
          rights, or professional obligations applying to confidential information you upload.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        You retain ownership of content you submit, subject to licenses needed to operate the
        Services (such as displaying, transmitting, securing, troubleshooting, analyzing for
        safety, and improving features as described in the Privacy Policy). Do not submit
        information you are not allowed to share.
      </p>

      <h2>Fees</h2>
      <p>
        Some deployments may be free; others may charge fees, taxes, or usage limits. When fees
        apply, terms will be presented at purchase or in a separate order form.
      </p>

      <h2>Third‑party services</h2>
      <p>
        Genocide AI may integrate with third‑party tools, models, or identity providers. Their
        terms and privacy practices govern those relationships in addition to ours.
      </p>

      <h2>Intellectual property</h2>
      <p>
        We and our licensors own the Services, associated materials, and branding, except as
        expressly licensed. Feedback you provide may be used without obligation to you.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Services are provided “as is” and “as available,” without warranties of any kind other
        than those that cannot be waived by law. AI outputs may be mistaken, biased, or outdated.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, neither party is liable for indirect, incidental,
        special, consequential, or punitive damages arising from these Terms or the Services. Our
        aggregate liability arising out of relating to these Terms ordinarily will not exceed the
        greater of (a) one hundred USD or (b) amounts you paid to us for the Services in the twelve
        months before the claim, except where statutes prohibit such caps (for instance for death,
        bodily injury caused by intentional misconduct, fraud, gross negligence where applicable).
      </p>

      <h2>Indemnity</h2>
      <p>
        To the extent allowed by law, you will defend and indemnify Genocide AI and its affiliates
        from third‑party claims arising from your use of the Services, your content, or your breach
        of these Terms, subject to customary fair process carve‑outs.
      </p>

      <h2>Suspension and termination</h2>
      <p>
        We may suspend or terminate access to protect safety, comply with law, or address abuse.
        Provisions intended to survive (such as disclaimers and limits on liability) continue.
      </p>

      <h2>Governing law</h2>
      <p>
        Unless superseded by a written agreement naming a different jurisdiction, disputes are
        governed by the laws of the place where Genocide AI is operated by its maintainers,
        without regard to conflict‑of‑laws principles, subject to protections you cannot waive as a consumer.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms periodically. Continuing to use Genocide AI after the effective date
        of changes constitutes acceptance unless a different acceptance mechanism is legally required,
        in which case we will comply with applicable notice procedures.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about these Terms, email{' '}
        <a
          className="text-zinc-200 underline underline-offset-2 hover:text-white"
          href="mailto:legal@example.com"
        >
          legal@example.com
        </a>{' '}
        or use the administrator contact supplied with your deployment.
      </p>
    </LegalPageLayout>
  )
}
