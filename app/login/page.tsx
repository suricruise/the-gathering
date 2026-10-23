import { AuthFrame } from "@/src/components/auth/AuthFrame";
import { AuthForm } from "@/src/components/auth/AuthForm";
import { authConfigured } from "@/src/lib/config";
import { safeNext } from "@/src/lib/auth/validation";
export const metadata = { title: "Sign in" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AuthFrame>
      {params.link === "invalid" && (
        <p role="alert" className="form-error">
          This link is invalid or expired. Request a new verification or
          recovery email.
        </p>
      )}
      {params.password === "updated" && (
        <p className="form-notice" role="status">
          Password updated. Sign in again with your new password.
        </p>
      )}
      {params.deleted === "1" && (
        <p className="form-notice" role="status">
          Your account has been deleted.
        </p>
      )}
      {params.loggedOut === "1" && (
        <p className="form-notice" role="status">
          You have signed out on this device.
        </p>
      )}
      <AuthForm
        mode="login"
        configured={authConfigured()}
        next={safeNext(params.next)}
      />
    </AuthFrame>
  );
}
