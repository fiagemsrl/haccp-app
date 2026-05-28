import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY mancante" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: "HACCP Easy <notifiche@domaristorante.it>",
      to: "fiagemsrl@gmail.com",
      subject: "Controllo HACCP automatico",
      html: `
        <h2>HACCP Easy</h2>
        <p>Ci sono documenti o controlli in scadenza.</p>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}