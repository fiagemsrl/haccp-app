"use client";

export default function BillingPage() {
  async function checkout(priceId: string) {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ priceId }),
    });

    const data = await res.json();

    window.location.href = data.url;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-5xl">

        <h1 className="text-4xl font-bold">
          Piani HACCP Easy
        </h1>

        <p className="mt-2 text-slate-500">
          Scegli il piano migliore per il tuo ristorante.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">

          {/* STARTER */}
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">
              Starter
            </h2>

            <p className="mt-2 text-slate-500">
              Per piccoli ristoranti
            </p>

            <p className="mt-6 text-5xl font-bold">
              €29
            </p>

            <p className="text-slate-500">
              /mese
            </p>

            <ul className="mt-6 space-y-2 text-sm">
              <li>✅ Checklist HACCP</li>
              <li>✅ Temperature</li>
              <li>✅ PDF</li>
              <li>✅ Email alert</li>
            </ul>

            <button
              onClick={() => checkout("price_1TcAzlJP68OUTShqnLWst6mF")}
              className="mt-8 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
            >
              Attiva piano
            </button>
          </div>

          {/* PRO */}
          <div className="rounded-3xl border-2 border-blue-600 bg-white p-6 shadow-lg">
            <div className="mb-3 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              POPOLARE
            </div>

            <h2 className="text-2xl font-bold">
              Pro
            </h2>

            <p className="mt-2 text-slate-500">
              Per ristoranti professionali
            </p>

            <p className="mt-6 text-5xl font-bold">
              €79
            </p>

            <p className="text-slate-500">
              /mese
            </p>

            <ul className="mt-6 space-y-2 text-sm">
              <li>✅ Multi-utenti</li>
              <li>✅ Analytics</li>
              <li>✅ Foto HACCP</li>
              <li>✅ Audit ready</li>
            </ul>

            <button
              onClick={() => checkout("price_1TcB0FJP68OUTShqJ1DOan5j")}
              className="mt-8 w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Attiva piano
            </button>
          </div>

          {/* ENTERPRISE */}
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">
              Enterprise
            </h2>

            <p className="mt-2 text-slate-500">
              Multi-sede e catene
            </p>

            <p className="mt-6 text-5xl font-bold">
              €149
            </p>

            <p className="text-slate-500">
              /mese
            </p>

            <ul className="mt-6 space-y-2 text-sm">
              <li>✅ Multi-sede</li>
              <li>✅ Export Excel</li>
              <li>✅ API</li>
              <li>✅ Supporto prioritario</li>
            </ul>

            <button
              onClick={() => checkout("price_1TcB0cJP68OUTShq4EFrUz3r")}
              className="mt-8 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
            >
              Attiva piano
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}