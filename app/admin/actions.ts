"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdminUserId } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminCreditState = { error?: string; success?: string };

const creditGrantSchema = z.object({
  userId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100),
  note: z.string().trim().max(240).default("")
});

export async function grantPremiumCredits(
  _previousState: AdminCreditState,
  formData: FormData
): Promise<AdminCreditState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Authentication is unavailable." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again before using admin controls." };
  if (!isAdminUserId(user.id)) return { error: "You do not have admin access." };

  const parsed = creditGrantSchema.safeParse({
    userId: formData.get("userId"),
    quantity: formData.get("quantity"),
    note: formData.get("note")
  });
  if (!parsed.success) return { error: "Choose a user and enter between 1 and 100 credits." };

  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "The admin service is not configured." };

  const externalRef = `admin:${user.id}:${randomUUID()}`;
  const { error } = await admin.rpc("grant_admin_credits", {
    p_user_id: parsed.data.userId,
    p_quantity: parsed.data.quantity,
    p_external_ref: externalRef,
    p_admin_user_id: user.id,
    p_note: parsed.data.note || null
  });
  if (error) {
    console.error("Admin credit grant failed", { code: error.code });
    return { error: "The credits could not be added. Please try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/account");
  revalidatePath("/dashboard");
  return { success: `${parsed.data.quantity} premium credit${parsed.data.quantity === 1 ? "" : "s"} added.` };
}
