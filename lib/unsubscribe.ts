import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function unsubscribeByTrackingToken(token: string, reason = "user_unsubscribe") {
  const supabase = getSupabaseAdmin() as any;
  const recipientResult = await supabase
    .from("campaign_recipients")
    .select("id,contact_id")
    .eq("tracking_token", token)
    .maybeSingle();

  if (recipientResult.error) throw new Error(recipientResult.error.message);
  if (!recipientResult.data) return { found: false };

  const contactResult = await supabase
    .from("contacts")
    .select("id,email,email_normalized")
    .eq("id", recipientResult.data.contact_id)
    .single();
  if (contactResult.error || !contactResult.data) throw new Error(contactResult.error?.message ?? "Contact not found");

  const now = new Date().toISOString();
  const normalized = contactResult.data.email_normalized || contactResult.data.email.trim().toLowerCase();

  const [contactUpdate, recipientUpdate, suppressionUpdate] = await Promise.all([
    supabase.from("contacts").update({ status: "unsubscribed" }).eq("id", contactResult.data.id),
    supabase.from("campaign_recipients").update({ unsubscribed_at: now, delivery_status: "unsubscribed" }).eq("id", recipientResult.data.id),
    supabase.from("suppression_list").upsert({ email_normalized: normalized, reason }, { onConflict: "email_normalized" })
  ]);

  const error = contactUpdate.error || recipientUpdate.error || suppressionUpdate.error;
  if (error) throw new Error(error.message);

  return { found: true };
}
