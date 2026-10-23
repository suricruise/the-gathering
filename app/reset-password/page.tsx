import { AuthFrame } from "@/src/components/auth/AuthFrame";
import { AuthForm } from "@/src/components/auth/AuthForm";
import { requireUser } from "@/src/lib/auth/session";
export const metadata = { title: "Choose a new password" };
export default async function ResetPasswordPage() {
  await requireUser();
  return (
    <AuthFrame>
      <AuthForm mode="reset" />
    </AuthFrame>
  );
}
