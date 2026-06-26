import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function ControlloPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;

  const { data: organization } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("public_control_token", token)
    .single();

  if (!organization) {
    return (
      <div style={{ padding: 40, fontFamily: "Arial" }}>
        <h1>Registro HACCP non trovato</h1>
        <p>QR Code non valido o portale non disponibile.</p>
      </div>
    );
  }

  const organizationId = organization.id;

  const [{ data: temperatures }, { data: checklist }, { data: cleaning }, { data: products }, { data: foodLabels }, { data: allergens }, { data: documents }, { data: nonConformities }] =
    await Promise.all([
      supabaseAdmin
        .from("temperatures")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("checklist_items")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("cleaning_logs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("products")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("food_labels")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("allergens")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50),

      supabaseAdmin
        .from("documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("uploaded_at", { ascending: false })
        .limit(20),

      supabaseAdmin
        .from("non_conformities")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const openNc = (nonConformities || []).filter(
    (n: any) => n.status !== "Chiusa"
  ).length;

  return (
    <main style={{ fontFamily: "Arial", background: "#f8fafc", minHeight: "100vh", padding: 24 }}>
      <section style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ background: "#0f172a", color: "white", borderRadius: 24, padding: 28 }}>
          <h1 style={{ margin: 0 }}>Registro HACCP Digitale</h1>
          <p style={{ marginTop: 8 }}>{organization.name}</p>
          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Consultazione pubblica in sola lettura
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 24 }}>
          <Card title="Temperature" value={temperatures?.length || 0} />
          <Card title="Checklist" value={checklist?.length || 0} />
          <Card title="Pulizie" value={cleaning?.length || 0} />
          <Card title="Magazzino" value={products?.length || 0} />
          <Card title="Etichette" value={foodLabels?.length || 0} />
          <Card title="Allergeni" value={allergens?.length || 0} />
          <Card title="Documenti" value={documents?.length || 0} />
          <Card title="Non conformità aperte" value={openNc} />
        </div>

        <Section title="Ultime temperature">
          {(temperatures || []).map((t: any) => (
            <Row key={t.id} left={t.area} right={`${t.value}°C - ${t.status}`} />
          ))}
        </Section>

        <Section title="Checklist recenti">
          {(checklist || []).map((c: any) => (
            <Row key={c.id} left={c.title} right={c.done ? "Completata" : "Aperta"} />
          ))}
        </Section>

        <Section title="Pulizie recenti">
          {(cleaning || []).map((c: any) => (
            <Row key={c.id} left={c.area} right={c.operator || "-"} />
          ))}
        </Section>

        <Section title="Etichette preparazioni">
          {(foodLabels || []).map((e: any) => (
            <Row key={e.id} left={e.product_name} right={`Scadenza: ${e.expiry || "-"}`} />
          ))}
        </Section>
      </section>
    </main>
  );
}

function Card({ title, value }: any) {
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 20, boxShadow: "0 1px 4px #e2e8f0" }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{title}</p>
      <h2 style={{ margin: "8px 0 0", fontSize: 32 }}>{value}</h2>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 20, marginTop: 20, boxShadow: "0 1px 4px #e2e8f0" }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function Row({ left, right }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e5e7eb", padding: "10px 0", gap: 16 }}>
      <span>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}