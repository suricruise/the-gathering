import { AuthFrame } from "@/src/components/auth/AuthFrame";
import { AuthForm } from "@/src/components/auth/AuthForm";
import { authConfigured } from "@/src/lib/config";
export const metadata = { title: "Recover your password" };
export default function ForgotPasswordPage() {
  return (
    <AuthFrame>
      <AuthForm mode="forgot" configured={authConfigured()} />
    </AuthFrame>
  );
}
