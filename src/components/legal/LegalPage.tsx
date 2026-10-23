import Link from "next/link";
const content = {
  terms: {
    title: "Terms of use",
    sections: [
      [
        "Review status",
        "This is a draft for operator and legal review before public launch. It does not identify a contracting entity or replace advice for your jurisdiction.",
      ],
      [
        "Membership",
        "The Gathering is for adults aged 18 and over. Use accurate account information, protect your credentials and respect other members. Age eligibility currently relies on date-of-birth self-attestation.",
      ],
      [
        "Your content",
        "You retain your rights in your content. Share only material you have permission to share. The service needs permission to host and display it to the audience you select, and to retain limited reported evidence for safety review.",
      ],
      [
        "Conduct and moderation",
        "Do not harass, threaten, exploit, impersonate, spam or share illegal content. Access may be restricted for violations. Appeals are available in the app or through the operator’s verified support process when sign-in is unavailable.",
      ],
      [
        "Voice and availability",
        "Voice uses LiveKit and your browser microphone permission. The app does not request recording by default; other participants can still capture audio outside the app. Availability and account/content deletion have documented operational limits.",
      ],
      [
        "Items requiring approval",
        "The operator must supply its legal identity and contact details, governing law, consumer rights, liability terms, effective date and acceptance/change process before this draft is adopted.",
      ],
    ],
  },
  privacy: {
    title: "Privacy notice",
    sections: [
      [
        "Review status",
        "Draft for operator and legal review. The operator must approve an effective notice and provide a real privacy contact before public launch.",
      ],
      [
        "Information used",
        "The service processes authentication details, private age-attestation information, gamer profiles, chosen interests, memberships, content, friend/block relationships, reports and operational audit metadata. Email addresses and birth dates are not a public member directory.",
      ],
      [
        "Audience controls",
        "Profiles, community membership, private channels, direct messages and prayer requests have separate access rules. A prayer marked private to moderators is visible to its author and current authorized community moderators. Staff can review reported items within their authorized scope. Messages are not end-to-end encrypted.",
      ],
      [
        "Providers and browser storage",
        "Supabase provides authentication, database, storage and real-time delivery. LiveKit carries voice media, and Vercel hosts the application. Session cookies are used for authentication; private Realtime tokens are kept for active connections. No advertising trackers, email delivery or push notification provider is added by this phase.",
      ],
      [
        "Retention and deletion",
        "Account deletion removes the authentication identity and dependent private records, and tombstones shared text where required. Reported evidence may remain for the configured safety-retention period (default 90 days, configurable 7–365). Minimal audit records and provider backups follow separate operator policies. Ownership must be transferred before deleting an owner account.",
      ],
      [
        "Items requiring approval",
        "The operator must specify legal bases, jurisdiction-specific rights, controller/processor contacts, international transfers, provider regions, exact backup/audit retention and the privacy request process. Do not put passwords or unnecessary personal information in prayer requests, reports or support messages.",
      ],
    ],
  },
  rules: {
    title: "Community rules",
    sections: [
      [
        "Be kind and respectful",
        "Welcome people with patience and compassion. Faith-based discussion should invite respectful conversation, never pressure, humiliation or discrimination.",
      ],
      [
        "Protect privacy",
        "Do not publish someone’s private messages, prayer details, identity, location or personal information without permission. Choose the smallest appropriate audience for sensitive requests.",
      ],
      [
        "Keep gaming fair and safe",
        "No cheating services, scams, malicious files, harassment, targeted abuse, sexual exploitation or threats. Share gaming clips and media only when you have the necessary rights.",
      ],
      [
        "Use reports and appeals",
        "Report concerns from a message, post, session or member screen. Give a concise factual explanation. Moderators should use the least intrusive appropriate action and keep sensitive evidence confidential. Use appeals for a decision you believe is mistaken.",
      ],
      [
        "Voice etiquette",
        "Ask before joining sensitive conversations, avoid disruptive sound and respect mute/leave controls. Do not record or redistribute others’ voices without appropriate consent.",
      ],
      [
        "Support boundaries",
        "Community prayer and encouragement are not emergency, medical or professional counseling services. Contact local emergency services for immediate danger. The operator must publish a real support and safety contact before launch.",
      ],
    ],
  },
};
export function LegalPage({ kind }: { kind: keyof typeof content }) {
  const p = content[kind];
  return (
    <main className="page legal-page">
      <Link href="/" className="text-link">
        ← The Gathering
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">REVIEW DRAFT · NOT YET ADOPTED</p>
          <h1>{p.title}</h1>
        </div>
      </header>
      {p.sections.map(([title, body]) => (
        <section key={title} className="panel padded">
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      ))}
      <nav aria-label="Policies">
        <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>{" "}
        · <Link href="/community-rules">Community rules</Link>
      </nav>
    </main>
  );
}
