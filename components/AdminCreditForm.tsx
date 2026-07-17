"use client";

import { useActionState } from "react";
import { Coins } from "lucide-react";
import { grantPremiumCredits, type AdminCreditState } from "@/app/admin/actions";

type AdminUserOption = { id: string; email: string; premiumCredits: number };
const initialState: AdminCreditState = {};

export function AdminCreditForm({ users }: { users: AdminUserOption[] }) {
  const [state, action, pending] = useActionState(grantPremiumCredits, initialState);

  return (
    <form action={action} className="card admin-credit-form">
      <div>
        <p className="eyebrow">Credit controls</p>
        <h2>Add premium pitches</h2>
        <p>Every grant is recorded in the credit ledger. A single grant is limited to 100 credits.</p>
      </div>
      {state.error ? <div className="error" role="alert">{state.error}</div> : null}
      {state.success ? <div className="success" role="status">{state.success}</div> : null}
      <div className="field">
        <label htmlFor="admin-user">Account</label>
        <select id="admin-user" name="userId" required>
          {users.map((user) => <option key={user.id} value={user.id}>{user.email} — {user.premiumCredits} premium credits</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="admin-quantity">Credits to add</label>
        <input defaultValue="5" id="admin-quantity" max="100" min="1" name="quantity" required type="number" />
      </div>
      <div className="field">
        <label htmlFor="admin-note">Reason <span className="optional-label">Optional</span></label>
        <input id="admin-note" maxLength={240} name="note" placeholder="Demo, testing, customer support…" />
      </div>
      <button className="button primary full" disabled={pending || users.length === 0} type="submit">
        <Coins size={18} aria-hidden="true" /> {pending ? "Adding credits…" : "Add premium credits"}
      </button>
    </form>
  );
}
