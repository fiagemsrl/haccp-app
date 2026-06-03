import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateTemporaryPassword() {
  return `Temp${Math.floor(100000 + Math.random() * 900000)}!`;
}

export async function POST(req: Request) {
  try {
    const { email, organizationId, role } = await req.json();

    if (!email || !organizationId || !role) {
      return NextResponse.json(
        { error: "Email, organizzazione o ruolo mancante" },
        { status: 400 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });

   if (userError) {
  if (userError.message.includes("already been registered")) {
    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo:
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://haccp-app-rouge.vercel.app",
    });

    return NextResponse.json({
      ok: true,
      alreadyRegistered: true,
    });
  }

  return NextResponse.json(
    { error: userError.message },
    { status: 400 }
  );
}

const userId = userData.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      full_name: email,
      must_change_password: true,
    });

    await supabaseAdmin.from("restaurant_users").upsert({
      organization_id: organizationId,
      user_id: userId,
      role,
    });

    await supabaseAdmin
      .from("invitations")
      .update({ accepted: true })
      .eq("email", email)
      .eq("organization_id", organizationId);

    return NextResponse.json({
      ok: true,
      temporaryPassword,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}