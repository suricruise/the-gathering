import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth-page">
      <h1>A little off the map</h1>
      <p>That page couldn’t be found.</p>
      <Link href="/" className="button primary">
        Back to The Gathering
      </Link>
    </main>
  );
}
