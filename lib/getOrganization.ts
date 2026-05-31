import { supabase } from "@/lib/supabase";

export async function getCurrentOrganizationId(userId: string) {
  const { data, error } = await supabase
    .from("restaurant_users")
    .select("organization_id, role")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Organization error:", error);
    return null;
  }

  return data;
}

export async function getOrganizationDetails(
  organizationId: string
) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();

  if (error) {
    console.error("Organization details error:", error);
    return null;
  }

  return data;
}