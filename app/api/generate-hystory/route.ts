import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const AREAS = [
  "Frigo positivo cucina",
  "Frigo pizzeria condimenti",
  "Banco frigo positivo",
  "Banco congelatore",
  "Abbattitore",
  "Freezer Algida",
  "Frigo bevande sala 1",
  "Frigo bevande sala 2",
];

function randomBetween(min: number, max: number) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

function isOpenDay(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDay();

  const summer = month >= 6 && month <= 10;

  if (summer) return day !== 1;

  return day === 5 || day === 6 || day === 0;
}

function getTemperature(area: string) {
  if (area.includes("congelatore") || area.includes("Freezer")) {
    return randomBetween(-21.5, -18.2);
  }

  if (area.includes("bevande")) {
    return randomBetween(3.5, 7.0);
  }

  return randomBetween(1.8, 4.0);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function chunkArray<T>(array: T[], size: number) {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

async function insertChunks(table: string, rows: any[]) {
  const chunks = chunkArray(rows, 500);

  for (const chunk of chunks) {
    const { error } = await supabaseAdmin
      .from(table)
      .insert(chunk);

    if (error) throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { organizationId, userId, year } = await req.json();

    if (!organizationId || !userId || !year) {
      return NextResponse.json(
        { error: "organizationId, userId o year mancante" },
        { status: 400 }
      );
    }

    const start = new Date(`${year}-01-01`);
    const end =
      Number(year) === 2026
        ? new Date("2026-06-03")
        : new Date(`${year}-12-31`);

    const temperatures: any[] = [];
    const checklist: any[] = [];
    const nonConformities: any[] = [];

    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (!isOpenDay(date)) continue;

      const iso = date.toISOString();

      for (const area of AREAS) {
        const value = getTemperature(area);

        const isFreezer =
          area.includes("congelatore") ||
          area.includes("Freezer");

        const status = isFreezer
          ? value <= -18
            ? "ok"
            : "alert"
          : value <= 7
          ? "ok"
          : "alert";

        temperatures.push({
          organization_id: organizationId,
          user_id: userId,
          area,
          value,
          operator: "Responsabile HACCP",
          status,
          created_at: iso,
        });
      }

      checklist.push(
        {
          organization_id: organizationId,
          user_id: userId,
          title: "Controllo temperature frigo/freezer",
          area: "Cucina",
          frequency: "Giornaliera",
          critical: true,
          done: true,
          operator: "Responsabile HACCP",
          created_at: iso,
        },
        {
          organization_id: organizationId,
          user_id: userId,
          title: "Pulizia e sanificazione superfici di lavoro",
          area: "Cucina",
          frequency: "Giornaliera",
          critical: true,
          done: true,
          operator: "Responsabile HACCP",
          created_at: iso,
        },
        {
          organization_id: organizationId,
          user_id: userId,
          title: "Controllo etichettatura sughi, salumi e prodotti aperti",
          area: "Magazzino",
          frequency: "Giornaliera",
          critical: false,
          done: true,
          operator: "Responsabile HACCP",
          created_at: iso,
        }
      );

      if (date.getDay() === 0) {
        checklist.push({
          organization_id: organizationId,
          user_id: userId,
          title:
            "Pulizia straordinaria settimanale cucina, friggitrice, forno e piani lavoro",
          area: "Cucina",
          frequency: "Settimanale",
          critical: false,
          done: true,
          operator: "Responsabile HACCP",
          created_at: iso,
        });
      }
    }

    const ncByYear: Record<string, string[]> = {
      "2024": ["2024-02-18", "2024-04-07", "2024-07-21", "2024-10-13"],
      "2025": ["2025-01-19", "2025-04-06", "2025-08-17", "2025-11-09"],
      "2026": ["2026-02-15", "2026-05-10"],
    };

    for (const d of ncByYear[String(year)] || []) {
      nonConformities.push({
        organization_id: organizationId,
        user_id: userId,
        title: "Etichetta lotto/scadenza non completa su prodotto aperto",
        severity: "Bassa",
        action:
          "Prodotto verificato, etichetta integrata con lotto, data apertura e scadenza interna.",
        status: "Chiusa",
        operator: "Responsabile HACCP",
        created_at: new Date(d).toISOString(),
      });
    }

    await insertChunks("temperatures", temperatures);
    await insertChunks("checklist_items", checklist);
    await insertChunks("non_conformities", nonConformities);

    return NextResponse.json({
      ok: true,
      year,
      temperatures: temperatures.length,
      checklist: checklist.length,
      nonConformities: nonConformities.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}