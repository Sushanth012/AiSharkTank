import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdminCreditForm } from "@/components/AdminCreditForm";
import { isAdminUserId } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/auth");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  if (!isAdminUserId(user.id)) notFound();

  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client is not configured.");
  const [{ data: authData, error: authError }, { data: balances, error: balanceError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
    admin.from("entitlement_summary").select("user_id,premium_credits")
  ]);
  if (authError) throw authError;
  if (balanceError) throw balanceError;

  const balanceByUser = new Map((balances ?? []).map((row) => [row.user_id, row.premium_credits]));
  const users = authData.users.map((account) => ({
    id: account.id,
    email: account.email ?? "Email unavailable",
    premiumCredits: balanceByUser.get(account.id) ?? 0
  }));

  return (
    <AppShell variant="workspace">
      <section className="admin-layout">
        <div className="admin-heading">
          <p className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Private admin room</p>
          <h1>Run the pitch floor.</h1>
          <p>This page is visible only to your approved founder account. Add testing or support credits without going through Stripe.</p>
        </div>
        <AdminCreditForm users={users} />
      </section>
    </AppShell>
  );
}
