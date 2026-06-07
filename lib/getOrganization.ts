export async function getCurrentOrganizationId(userId: string) {
  console.log("GET ORG START", userId);

  try {
    const result = await Promise.race([
      supabase
        .from("restaurant_users")
        .select("organization_id, role")
        .eq("user_id", userId)
        .single(),

      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("GET ORG TIMEOUT")),
          10000
        )
      ),
    ]);

    console.log("GET ORG RESULT", result);

    const { data, error }: any = result;

    if (error) {
      console.error("GET ORG ERROR", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("GET ORG CATCH", error);
    return null;
  }
}