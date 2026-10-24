import { AuthFrame } from "@/src/components/auth/AuthFrame";
import { VerificationHelp } from "@/src/components/auth/VerificationHelp";
import { authConfigured } from "@/src/lib/config";
export const metadata = { title: "Email verification help", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
const descriptions: Record<string,string> = {
  invalid: "This verification link is missing, expired or already used. If your email was verified, you can sign in. Otherwise request a new email below.",
  browser: "This email link could not finish signing you in. Open it in the same browser where you registered, or sign in with your email and password if verification already completed.",
  unavailable: "Verification could not finish because the authentication service was unavailable. Try the link again shortly. If it has already been used, sign in or request a fresh email.",
  configuration: "Email verification is not configured correctly on this deployment. Contact the community team so they can check the site URL and authentication settings.",
};
export default async function VerifyEmailPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  const problem=typeof query.reason === "string" && Object.hasOwn(descriptions, query.reason) ? descriptions[query.reason] : undefined;
  return <AuthFrame><span className="eyebrow">LET’S GET YOU CONNECTED</span><h1>Finish verifying your email.</h1>
    {problem && <p className="form-error" role="alert">{problem}</p>}
    <p className="auth-description">Use the newest verification email. Once verified, sign in to choose your username and finish your profile. You do not need to create another account.</p>
    <VerificationHelp configured={authConfigured()} />
  </AuthFrame>;
}
