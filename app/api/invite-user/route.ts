import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateTemporaryPassword() {
  return `Temp${Math.floor(100000 + Math.random() * 900000)}!`;
}

async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) return null;

  return data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
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

    const cleanEmail = email.trim().toLowerCase();
    const temporaryPassword = generateTemporaryPassword();

    let userId = "";

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: temporaryPassword,
        email_confirm: true,
      });

    if (userError) {
      if (!userError.message.includes("already been registered")) {
        return NextResponse.json(
          { error: userError.message },
          { status: 400 }
        );
      }

      const existingUser = await findUserByEmail(cleanEmail);

      if (!existingUser) {
        return NextResponse.json(
          { error: "Utente già registrato ma non trovato" },
          { status: 400 }
        );
      }

      userId = existingUser.id;
    } else {
      userId = userData.user.id;
    }

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: cleanEmail,
      full_name: cleanEmail,
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
      .eq("email", cleanEmail)
      .eq("organization_id", organizationId);

    if (userError) {
      await supabaseAdmin.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo:
          process.env.NEXT_PUBLIC_SITE_URL ||
          "https://haccp-app-rouge.vercel.app",
      });

      return NextResponse.json({
        ok: true,
        alreadyRegistered: true,
      });
    }

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