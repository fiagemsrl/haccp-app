import { supabase } from "@/lib/supabase";

export async function getSubscriptionStatus(organizationId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, plan")
    .eq("organization_id", organizationId)
    .single();

  if (error) {
    return null;
  }

  return data;
}