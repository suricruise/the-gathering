import { AuthFrame } from "@/src/components/auth/AuthFrame";
import { AuthForm } from "@/src/components/auth/AuthForm";
import { authConfigured } from "@/src/lib/config";
export const metadata = { title: "Join The Gathering" };
export default function RegistrationPage() {
  return (
    <AuthFrame>
      <AuthForm mode="register" configured={authConfigured()} />
    </AuthFrame>
  );
}
