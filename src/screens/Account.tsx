"use client";
import { useState } from "react";
import { Gamepad2, ShieldCheck, Users, WifiOff } from "lucide-react";
import { EmptyState, PageHeading } from "../components/ui";
export function Admin() {
  const [tab, setTab] = useState("Overview");
  return (
    <div className="page">
      <PageHeading
        eyebrow="CARE FOR THE COMMUNITY"
        title="Admin workspace"
        description="A thoughtful foundation for a healthy gathering."
      >
        <span className="pill muted-pill">
          <ShieldCheck size={15} />
          Development shell
        </span>
      </PageHeading>
      <div className="admin-warning">
        <ShieldCheck size={22} />
        <div>
          <strong>
            This workspace does not grant administrative privileges.
          </strong>
          <p>
            No administrative data or actions are connected. Production access
            requires server-enforced roles and authorization.
          </p>
        </div>
      </div>
      <div className="tabs" role="group" aria-label="Admin sections">
        {["Overview", "Members", "Moderation", "Communities"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" ? (
        <>
          <div className="admin-stats">
            {[
              { name: "Members", icon: Users },
              { name: "Communities", icon: Gamepad2 },
              { name: "Open reports", icon: ShieldCheck },
            ].map((stat) => (
              <div className="panel stat-card" key={stat.name}>
                <stat.icon size={21} />
                <span>{stat.name}</span>
                <strong>—</strong>
                <small>Live data unavailable</small>
              </div>
            ))}
          </div>
          <div className="panel">
            <EmptyState
              icon={<WifiOff size={28} />}
              title="Ready for a real connection"
              description="Member trends, reports, and audit activity will appear when authenticated admin services are available."
            />
          </div>
        </>
      ) : (
        <section className="panel">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title={`${tab} service is not connected`}
            description={`No ${tab.toLowerCase()} records have been loaded. Administrative actions remain unavailable.`}
          />
        </section>
      )}
      <section className="panel padded admin-checklist">
        <h2>Before this workspace goes live</h2>
        <p>
          Connect authentication, enforce permissions on the server, and add a
          real audit trail for all administrative actions.
        </p>
        <button className="button secondary" disabled>
          Administrative actions unavailable
        </button>
      </section>
    </div>
  );
}
