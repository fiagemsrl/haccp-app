import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  try {
    await resend.emails.send({
      from: "HACCP Easy <onboarding@resend.dev>",
      to: "TUAMAIL@gmail.com",
      subject: "Controllo HACCP automatico",
      html: `
        <h2>HACCP Easy</h2>
        <p>Ci sono documenti o controlli in scadenza.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error });
  }
}