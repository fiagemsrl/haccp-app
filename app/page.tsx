"use client";
// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import SignatureCanvas from "react-signature-canvas";
import { getSubscriptionStatus } from "@/lib/getSubscription";
import {
  getCurrentOrganizationId,
  getOrganizationDetails,
} from "@/lib/getOrganization";import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

const STORAGE_KEY = "haccp_easy_restaurant_app_v1";
const today = new Date().toISOString().slice(0, 10);


const defaultState = {
  restaurant: {
    id: "",
    name: "",
    address: "",
    haccpManager: "",
    fridgeLimit: 4,
    freezerLimit: -18,
  },

  currentUser: "",

  tasks: [],
  temperatures: [],
  products: [],
  documents: [],
  nonConformities: [],
  staff: [],
  suppliers: [],
  reports: [],
  cleaning: [],
  allergens: [],
};
function clone(value: any) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultState);
    return { ...clone(defaultState), ...JSON.parse(raw) };
  } catch {
    return clone(defaultState);
  }
}

function getTime() {
  return new Date().toTimeString().slice(0, 5);
}

function cx(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

function daysUntil(dateString: string) {
  const now = new Date(today + "T00:00:00").getTime();
  const target = new Date(dateString + "T00:00:00").getTime();

  return Math.ceil((target - now) / 86400000);
}
function getProductStatus(expiry: string) {
  const days = daysUntil(expiry);
  if (days <= 2) return "critico";
  if (days <= 7) return "in_scadenza";
  return "ok";
}

function getTemperatureStatus(
  area: string,
  value: number,
  settings: any
) {
  const lowerArea = String(area).toLowerCase();
  if (lowerArea.includes("freezer") || lowerArea.includes("congel")) return value <= Number(settings.freezerLimit || -18) ? "ok" : "alert";
  return value <= Number(settings.fridgeLimit || 4) ? "ok" : "alert";
}

function getTemperatureRange(area: string, settings: any) {
  const lowerArea = String(area).toLowerCase();
  if (lowerArea.includes("freezer") || lowerArea.includes("congel")) return { min: -25, max: Number(settings.freezerLimit || -18) };
  return { min: 0, max: Number(settings.fridgeLimit || 4) };
}

function filterProducts(products: any[], query: string) {
  const q = String(query).trim().toLowerCase();
  if (!q) return products;
  return products.filter((product) => [product.name, product.lot, product.location, product.quantity].join(" ").toLowerCase().includes(q));
}

function calculateProgress(tasks: any[]) {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((task: any) => task.done).length / tasks.length) * 100);
}

function generateReportHtml(state: any, type: "temperature" | "checklist" | "nonconformities" | "products") {
  const date = new Date().toLocaleString("it-IT");
 const rows = {
  temperature: state.temperatures
    .map(
      (t: any) =>
        `<tr><td>${t.date}</td><td>${t.time}</td><td>${t.area}</td><td>${t.value}°C</td><td>${t.operator}</td><td>${t.status}</td></tr>`
    )
    .join(""),

  checklist: state.tasks
    .map(
      (t: any) =>
        `<tr><td>${t.date}</td><td>${t.title}</td><td>${t.area}</td><td>${t.done ? "Completata" : "Aperta"}</td><td>${t.operator || "-"}</td></tr>`
    )
    .join(""),

  nonconformities: state.nonConformities
    .map(
      (n: any) =>
        `<tr><td>${n.date}</td><td>${n.title}</td><td>${n.severity}</td><td>${n.status}</td><td>${n.action}</td></tr>`
    )
    .join(""),

  products: state.products
    .map(
      (p: any) =>
        `<tr><td>${p.name}</td><td>${p.lot}</td><td>${p.expiry}</td><td>${p.location}</td><td>${p.status}</td></tr>`
    )
    .join(""),
};
  const titles = {
    temperature: "Registro temperature",
    checklist: "Checklist operative",
    nonconformities: "Registro non conformità",
    products: "Registro magazzino e scadenze",
  };
  const headers = {
    temperature: "<th>Data</th><th>Ora</th><th>Area</th><th>Temperatura</th><th>Operatore</th><th>Esito</th>",
    checklist: "<th>Data</th><th>Controllo</th><th>Area</th><th>Stato</th><th>Operatore</th>",
    nonconformities: "<th>Data</th><th>Problema</th><th>Gravità</th><th>Stato</th><th>Azione</th>",
    products: "<th>Prodotto</th><th>Lotto</th><th>Scadenza</th><th>Posizione</th><th>Stato</th>",
  };

  return `<!doctype html><html><head><meta charset="utf-8"><title>${titles[type]}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{margin-bottom:4px}.meta{color:#64748b;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;font-size:12px}th{background:#f1f5f9}.signature{margin-top:48px}</style></head><body><h1>${titles[type]}</h1><div class="meta">${state.restaurant.name} · Generato il ${date} · Responsabile ${state.restaurant.haccpManager}</div><table><thead><tr>${headers[type]}</tr></thead><tbody>${rows[type] || ""}</tbody></table><div class="signature">Firma responsabile HACCP: __________________________</div><script>window.print()</script></body></html>`;
}

function downloadTextFile(
  filename: string,
  content: string,
  mime: string = "text/html"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function runSelfTests() {
  const settings = defaultState.restaurant;
  const results: { name: string; passed: boolean }[] = [];
  const test = (name: string, condition: boolean) =>
  results.push({ name, passed: Boolean(condition) });
  test("Frigo <= 4°C è OK", getTemperatureStatus("Frigo carne", 3.9, settings) === "ok");
  test("Frigo > 4°C crea alert", getTemperatureStatus("Frigo verdure", 4.1, settings) === "alert");
  test("Freezer <= -18°C è OK", getTemperatureStatus("Freezer", -18.5, settings) === "ok");
  test("Freezer > -18°C crea alert", getTemperatureStatus("Freezer", -17.2, settings) === "alert");
  test("Ricerca magazzino per lotto", filterProducts(defaultState.products, "POL-774").length === 1);
  test("Progresso checklist calcolato", calculateProgress(defaultState.tasks) === 20);
  test("Prodotto entro 2 giorni è critico", getProductStatus("2026-05-27") === "critico");
  return results;
}

const selfTests = runSelfTests();

function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const icons = {
    alert: "⚠️", calendar: "📅", check: "✅", clipboard: "📋", dashboard: "📊", document: "📄", download: "⬇️", fridge: "❄️", package: "📦", plus: "+", search: "🔎", settings: "⚙️", shield: "🛡️", team: "👥", temp: "🌡️", upload: "⬆️", supplier: "🚚", report: "🧾", trash: "🗑️", save: "💾", print: "🖨️",
  };
  return (
  <span
    className={cx(
      "inline-flex h-5 w-5 items-center justify-center text-base",
      className
    )}
    aria-hidden="true"
  >
    {(icons as Record<string, string>)[name] || "•"}
  </span>
);
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx("rounded-3xl bg-white shadow-sm", className)}>{children}</div>;
}

function Button({
  children,
  className = "",
  variant = "default",
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "secondary" | "danger";
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  return <button type={type} onClick={onClick} className={cx("inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99]", variant === "secondary" ? "bg-slate-100 text-slate-800 hover:bg-slate-200" : variant === "danger" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-900 text-white hover:bg-slate-800", className)}>{children}</button>;
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "blue";
}) {
  const tones = { neutral: "bg-slate-100 text-slate-700", ok: "bg-emerald-100 text-emerald-700", warn: "bg-amber-100 text-amber-700", danger: "bg-rose-100 text-rose-700", blue: "bg-blue-100 text-blue-700" };
  return <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", tones[tone] || tones.neutral)}>{children}</span>;
}

function TextInput(props: any) {
  return <input {...props} className={cx("w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400", props.className || "")} />;
}

function SelectInput(props: any) {
  return <select {...props} className={cx("w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-400", props.className || "")} />;
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return <button onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition", active ? "bg-slate-900 text-white shadow-lg" : "text-slate-600 hover:bg-slate-100")}><Icon name={icon} />{label}</button>;
}

function StatCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: string;
  label: string;
  value: string | number;
  helper: string;
  tone?: string;
}) {
  return <Card><div className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div><div className={cx("rounded-2xl p-3", tone || "bg-slate-100")}><Icon name={icon} /></div></div></div></Card>;
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-2xl font-bold text-slate-950">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div>{action}</div>;
}

export default function HaccpRestaurantApp() {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [organizationData, setOrganizationData] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [managerName, setManagerName] = useState("");
  const [phone, setPhone] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [state, setState] = useState(() => clone(defaultState));
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [newTemp, setNewTemp] = useState({ area: "", value: "", operator: state.currentUser });
  const [newProduct, setNewProduct] = useState({ name: "", lot: "", expiry: "", location: "", quantity: "" });
  const [newNc, setNewNc] = useState({ title: "", severity: "Media", action: "", operator: state.currentUser });
  const [ncPhoto, setNcPhoto] = useState<File | null>(null);
  const [newTask, setNewTask] = useState({ title: "", area: "Cucina", frequency: "Giornaliera", critical: false });
  const [newDocument, setNewDocument] = useState({ name: "", type: "PDF", category: "Manuale", expiry: "" });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [newFoodLabel, setNewFoodLabel] = useState({productName: "",supplier: "",lot: "",expiry: "",openedAt: "",ingredients: "",allergens: "",notes: "",});
  const [newCleaning, setNewCleaning] = useState({area: "",product: "",operator: state.currentUser,});
  const [newAllergen, setNewAllergen] = useState({product: "",allergens: "",});
  const [foodLabelPhoto, setFoodLabelPhoto] = useState<File | null>(null);
  const [foodLabels, setFoodLabels] = useState<any[]>([]);
  const [newStaff, setNewStaff] = useState({ name: "", role: "", trainingExpiry: "" });
  const [newSupplier, setNewSupplier] = useState({ name: "", category: "", phone: "", approved: true });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("employee");
  const [invitations, setInvitations] = useState<any[]>([]);

async function acceptPendingInvitation(currentUser: any) {
  if (!currentUser?.email) return null;

  const { data: invitation } = await supabase
    .from("invitations")
    .select("*")
    .eq("email", currentUser.email.toLowerCase())
    .eq("accepted", false)
    .maybeSingle();

  if (!invitation) return null;

  await supabase.from("restaurant_users").insert({
    organization_id: invitation.organization_id,
    user_id: currentUser.id,
    role: invitation.role,
  });

  await supabase
    .from("invitations")
    .update({ accepted: true })
    .eq("id", invitation.id);

  return {
    organization_id: invitation.organization_id,
    role: invitation.role,
  };
}
useEffect(() => {  
const hash = window.location.hash;
  const search = window.location.search;

  if (
    hash.includes("type=recovery") ||
    search.includes("type=recovery")
  ) {
    setAuthMode("reset");
  }
  supabase.auth.getUser().then(async ({ data }) => {
    setUser(data.user);

    if (data.user) {
      let orgData = await getCurrentOrganizationId(data.user.id);

if (!orgData?.organization_id) {
  orgData = await acceptPendingInvitation(data.user);
}
      setOrganization(orgData);

      if (orgData?.organization_id) {
        localStorage.setItem("organization_id", orgData.organization_id);

        const details = await getOrganizationDetails(orgData.organization_id);
        setOrganizationData(details);

        const sub = await getSubscriptionStatus(orgData.organization_id);
        setSubscription(sub);
      }
    }
  });

  const { data: listener } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
console.log("AUTH EVENT:", _event);
  if (_event === "PASSWORD_RECOVERY") {
    setAuthMode("reset");
  }
      setUser(session?.user ?? null);


      if (session?.user) {
        let orgData = await getCurrentOrganizationId(session.user.id);

if (!orgData?.organization_id) {
  orgData = await acceptPendingInvitation(session.user);
}

setOrganization(orgData);
        
        if (orgData?.organization_id) {
          localStorage.setItem("organization_id", orgData.organization_id);

          const details = await getOrganizationDetails(orgData.organization_id);
          setOrganizationData(details);

          const sub = await getSubscriptionStatus(orgData.organization_id);
          setSubscription(sub);
        }
      }
    }
  );

  return () => {
    listener.subscription.unsubscribe();
  };
}, []);
useEffect(() => {
  setMounted(true);
}, []);

async function loadChecklist() {
  if (!user || !organization) return;

  const years = ["2024", "2025", "2026"];
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  let allData: any[] = [];

  for (const y of years) {
    for (const m of months) {
      const start = `${y}-${m}-01T00:00:00.000Z`;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("organization_id", organization.organization_id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .range(0, 10000);

      if (error) {
        alert("Errore caricamento checklist: " + error.message);
        return;
      }

      allData.push(...(data || []));
    }
  }

  patch((prev: any) => ({
    ...prev,
    tasks: allData.map((item: any) => ({
      id: item.id,
      title: item.title,
      area: item.area,
      frequency: item.frequency,
      done: item.done,
      critical: item.critical,
      operator: item.operator || "",
      date: new Date(item.created_at).toISOString().slice(0, 10),
    })),
  }));
}

async function loadTemperatures() {
  if (!user || !organization) return;

  const years = ["2024", "2025", "2026"];
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  let allData: any[] = [];

  for (const y of years) {
    for (const m of months) {
      const start = `${y}-${m}-01T00:00:00.000Z`;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("temperatures")
        .select("*")
        .eq("organization_id", organization.organization_id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .range(0, 10000);

      if (error) {
        alert("Errore caricamento temperature: " + error.message);
        return;
      }

      allData.push(...(data || []));
    }
  }

  patch((prev: any) => ({
    ...prev,
    temperatures: allData.map((t: any) => ({
      id: t.id,
      area: t.area,
      value: t.value,
      operator: t.operator,
      status: t.status,
      date: new Date(t.created_at).toISOString().slice(0, 10),
      time: new Date(t.created_at).toTimeString().slice(0, 5),
      min: 0,
      max: 4,
    })),
  }));
}
async function loadDocuments() {
  if (!user || !organization) return;

  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", organization.organization_id)
    .order("uploaded_at", { ascending: false });

  if (data) {
    patch((prev: any) => ({
      ...prev,
      documents: data.map((d: any) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        category: d.category,
        expiry: d.expiry,
        uploadedAt: d.uploaded_at,
        url: d.url,
      })),
    }));
  }
}

async function loadNonConformities() {
  if (!user || !organization) return;

  const years = ["2024", "2025", "2026"];
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  let allData: any[] = [];

  for (const y of years) {
    for (const m of months) {
      const start = `${y}-${m}-01T00:00:00.000Z`;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("non_conformities")
        .select("*")
        .eq("organization_id", organization.organization_id)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .range(0, 10000);

      if (error) {
        alert("Errore caricamento non conformità: " + error.message);
        return;
      }

      allData.push(...(data || []));
    }
  }

  patch((prev: any) => ({
    ...prev,
    nonConformities: allData.map((n: any) => ({
      id: n.id,
      title: n.title,
      severity: n.severity,
      action: n.action,
      status: n.status,
      operator: n.operator,
      photoUrl: n.photo_url,
      date: new Date(n.created_at).toISOString().slice(0, 10),
    })),
  }));
}
async function loadInvitations() {
  const organizationId =
    organization?.organization_id ||
    localStorage.getItem("organization_id");

  if (!organizationId) return;

  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true }).range(0, 50000);

if (error) {
  alert("Errore caricamento inviti: " + error.message);
  return;
}

console.log("INVITATIONS:", data);

setInvitations(data || []);
}
useEffect(() => {
  if (user && organization) {
    loadTemperatures();
    loadChecklist();
    loadDocuments();
    loadNonConformities();
    loadCleaning();
    loadInvitations();
  }
}, [user, organization]);
async function handleAuth() {
  setAuthError("");

  if (authMode === "register") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    if (data.user) {
  await supabase.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: email,
  });

const { data: invitation } = await supabase
  .from("invitations")
  .select("*")
  .eq("email", email.toLowerCase())
  .eq("accepted", false)
  .maybeSingle();

  if (invitation) {
  await supabase.from("restaurant_users").insert({
    organization_id: invitation.organization_id,
    user_id: data.user.id,
    role: invitation.role,
  });

  await supabase
    .from("invitations")
    .update({
      accepted: true,
    })
    .eq("id", invitation.id);

  setOrganization({
    organization_id: invitation.organization_id,
    role: invitation.role,
  });

  return;
}
const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: restaurantName,
      vat_number: vatNumber,
      address,
      manager_name: managerName,
      phone,
    })
    .select()
    .single();

  if (orgError) {
    setAuthError(orgError.message);
    return;
  }

  await supabase.from("restaurant_users").insert({
    organization_id: orgData.id,
    user_id: data.user.id,
    role: "owner",
  });

  setOrganization({
    organization_id: orgData.id,
    role: "owner",
  });
}
  } else {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
    }
  }
}

async function logout() {
  await supabase.auth.signOut({
    scope: "global",
  });

  localStorage.clear();
  sessionStorage.clear();
  location.reload();

  setUser(null);
  setOrganization(null);

  setState(clone(defaultState));

  window.location.href = "/";
}  const openTasks = state.tasks.filter((task: any) => !task.done).length;

const alerts =
  state.temperatures.filter((temperature: any) => temperature.status === "alert").length +
  state.products.filter((product: any) => product.status !== "ok").length +
  state.nonConformities.filter((nonConformity: any) => nonConformity.status !== "Chiusa").length;
  const progress = calculateProgress(state.tasks);
  const filteredProducts = useMemo(() => filterProducts(state.products, query), [state.products, query]);
function matchYearMonth(item: any) {
  const date = String(item.date || "");

  const matchYear =
    selectedYear === "all" || date.startsWith(selectedYear);

  const matchMonth =
    selectedMonth === "all" || date.slice(5, 7) === selectedMonth;

  return matchYear && matchMonth;
}

const filteredTemperatures = state.temperatures.filter(matchYearMonth);
const filteredTasks = state.tasks.filter(matchYearMonth);
const filteredNonConformities = state.nonConformities.filter(matchYearMonth);
const YearFilter = (
  <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
    <SelectInput
      value={selectedYear}
      onChange={(e) => {
        setSelectedYear(e.target.value);
        setSelectedMonth("all");
      }}
    >
      <option value="all">Tutti gli anni</option>
      <option value="2026">2026</option>
      <option value="2025">2025</option>
      <option value="2024">2024</option>
    </SelectInput>

    <SelectInput
      value={selectedMonth}
      onChange={(e) => setSelectedMonth(e.target.value)}
    >
      <option value="all">Tutti i mesi</option>
      <option value="01">Gennaio</option>
      <option value="02">Febbraio</option>
      <option value="03">Marzo</option>
      <option value="04">Aprile</option>
      <option value="05">Maggio</option>
      <option value="06">Giugno</option>
      <option value="07">Luglio</option>
      <option value="08">Agosto</option>
      <option value="09">Settembre</option>
      <option value="10">Ottobre</option>
      <option value="11">Novembre</option>
      <option value="12">Dicembre</option>
    </SelectInput>
  </div>
);  const expiringDocs = state.documents.filter((doc: any) => daysUntil(doc.expiry) <= 45).length;
const temperatureChartData = state.temperatures
  .slice(-7)
  .map((t: any) => ({
    date: t.date,
    value: Number(t.value),
  }));

const checklistChartData = [
  {
    name: "Completate",
    value: state.tasks.filter((t: any) => t.done).length,
  },
  {
    name: "Aperte",
    value: state.tasks.filter((t: any) => !t.done).length,
  },
];

const ncChartData = [
  {
    name: "Critiche",
    value: state.nonConformities.filter(
      (n: any) => n.severity === "Alta"
    ).length,
  },
  {
    name: "Normali",
    value: state.nonConformities.filter(
      (n: any) => n.severity !== "Alta"
    ).length,
  },
];

const documentChartData = state.documents.map((d: any) => ({
  name: d.name.slice(0, 10),
  giorni: daysUntil(d.expiry),
}));

  function patch(updater: any) {
    setState((prev: any) =>
  typeof updater === "function" ? updater(prev) : { ...prev, ...updater }
);
  }

  async function toggleTask(id: number) {
  const task = state.tasks.find((t: any) => t.id === id);
  if (!task) return;

  await supabase
    .from("checklist_items")
    .update({
      done: !task.done,
      operator: !task.done ? state.currentUser : "",
    })
    .eq("id", id)
    .eq("user_id", user?.id);

await loadChecklist();
}
    
  async function addTask() {
  if (!newTask.title.trim()) return;

  await supabase.from("checklist_items").insert({
  user_id: user?.id,
  organization_id: organization.organization_id,
    title: newTask.title.trim(),
    area: newTask.area,
    frequency: newTask.frequency,
    critical: newTask.critical,
    done: false,
    operator: "",
  });

  await loadChecklist();

  setNewTask({
    title: "",
    area: "Cucina",
    frequency: "Giornaliera",
    critical: false,
  });
}

  
async function addTemperature() {
  const value = Number(newTemp.value);
  if (!newTemp.area.trim() || Number.isNaN(value)) return;

  const status = getTemperatureStatus(newTemp.area, value, state.restaurant);

  patch((prev: any) => {
    const range = getTemperatureRange(newTemp.area, prev.restaurant);

    const entry = {
      id: Date.now(),
      area: newTemp.area.trim(),
      value,
      min: range.min,
      max: range.max,
      date: today,
      time: getTime(),
      operator: newTemp.operator.trim() || prev.currentUser,
      status,
    };

    const nonConformity =
      status === "alert"
        ? [
            {
              id: Date.now() + 1,
              title: `${entry.area} fuori soglia`,
              severity: "Media",
              action:
                "Verificare alimenti, ripetere misurazione e controllare attrezzatura",
              status: "Aperta",
              date: today,
              operator: entry.operator,
            },
          ]
        : [];

    return {
      ...prev,
      temperatures: [entry, ...prev.temperatures],
      nonConformities: [...nonConformity, ...prev.nonConformities],
    };
  });

 const { data, error } = await supabase.from("temperatures").insert({
  organization_id: organization.organization_id,
  user_id: user?.id,
  area: newTemp.area.trim(),
  value,
  operator: newTemp.operator.trim() || state.currentUser,
  status,
});

  console.log("Supabase data:", data);
  console.log("Supabase error:", error);
  if (error) {
  alert("Errore caricamento temperature: " + error.message);
  return;
}
  await loadTemperatures();

  setNewTemp({ area: "", value: "", operator: state.currentUser });
}

  function addProduct() {
    if (!newProduct.name.trim() || !newProduct.expiry) return;
    patch((prev: any) => ({ ...prev, products: [{ id: Date.now(), ...newProduct, name: newProduct.name.trim(), opened: false, status: getProductStatus(newProduct.expiry) }, ...prev.products] }));
    setNewProduct({ name: "", lot: "", expiry: "", location: "", quantity: "" });
  }

 async function addDocument() {
  if (!newDocument.name.trim() || !documentFile) return;

  const fileName = `${Date.now()}-${documentFile.name}`;

  const { data, error } = await supabase.storage
    .from("documents")
    .upload(fileName, documentFile);

  if (error) {
    console.error(error);
    return;
  }

  const fileUrl = supabase.storage
  .from("documents")
  .getPublicUrl(fileName).data.publicUrl;

await supabase.from("documents").insert({
  organization_id: organization.organization_id,
  user_id: user?.id,
  name: newDocument.name.trim(),
  type: newDocument.type,
  category: newDocument.category,
  expiry: newDocument.expiry || null,
  url: fileUrl,
});

patch((prev: any) => ({
    ...prev,
    documents: [
      {
        id: Date.now(),
        ...newDocument,
        name: newDocument.name.trim(),
        uploadedAt: today,
        url: fileUrl,
      },
      ...prev.documents,
    ],
  }));

  setNewDocument({
    name: "",
    type: "PDF",
    category: "Manuale",
    expiry: "",
  });

  setDocumentFile(null);
}

async function addNonConformity() {
  if (!newNc.title.trim()) return;

  let photoUrl = "";

  if (ncPhoto) {
    const fileName = `${Date.now()}-${ncPhoto.name}`;

    const { error } = await supabase.storage
      .from("documents")
      .upload(fileName, ncPhoto);

    if (!error) {
      photoUrl = supabase.storage
        .from("documents")
        .getPublicUrl(fileName).data.publicUrl;
    }
  }

await supabase.from("non_conformities").insert({
  organization_id: organization.organization_id,
  user_id: user?.id,
  title: newNc.title.trim(),
  severity: newNc.severity,
  action: newNc.action,
  status: "Aperta",
  photo_url: photoUrl,
  operator: newNc.operator,
});
  
patch((prev: any) => ({
    ...prev,
    nonConformities: [
      {
        id: Date.now(),
        ...newNc,
        title: newNc.title.trim(),
        status: "Aperta",
        date: today,
        photoUrl,
      },
      ...prev.nonConformities,
    ],
  }));

  setNewNc({
    title: "",
    severity: "Media",
    action: "",
    operator: state.currentUser,
  });

  setNcPhoto(null);
}

  
  async function closeNonConformity(id: number) {
  await supabase
    .from("non_conformities")
    .update({
      status: "Chiusa",
    })
    .eq("id", id);

  await loadNonConformities();
}

 async function inviteCollaborator() {
  const organizationId =
    organization?.organization_id ||
    localStorage.getItem("organization_id");

  if (!inviteEmail.trim() || !organizationId) {
    alert("Email o organizzazione mancante");
    return;
  }

  const cleanEmail = inviteEmail.trim().toLowerCase();

  supabase
  .from("invitations")
  .upsert(
    {
      organization_id: organizationId,
      email: cleanEmail,
      role: inviteRole,
      accepted: false,
    },
    {
      onConflict: "organization_id,email",
    }
  )
  .then(async (result) => {
    if (result.error) {
      alert("Errore Supabase: " + result.error.message);
      return;
    }

     const res = await fetch("/api/invite-user", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: cleanEmail,
    organizationId,
    role: inviteRole,
  }),
});
const json = await res.json();
if (!res.ok) {
  alert("Invito salvato, ma email non inviata: " + json.error);
  return;
}

setInvitations((prev) => [
  {
    id: Date.now(),
    organization_id: organizationId,
    email: cleanEmail,
    role: inviteRole,
    accepted: false,
  },
  ...prev,
]);

setInviteEmail("");
setInviteRole("employee");

alert(
  "Utente creato. Password temporanea: " +
    json.temporaryPassword
);
 });
} 
async function resendInvitation(invite: any) {
  const organizationId =
    organization?.organization_id ||
    localStorage.getItem("organization_id");

  if (!organizationId) {
    alert("Organizzazione mancante");
    return;
  }

  const res = await fetch("/api/invite-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: invite.email,
      organizationId,
      role: invite.role,
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    alert("Errore reinvio: " + json.error);
    return;
  }

if (json.alreadyRegistered) {
  alert("Utente già registrato. Email reset password inviata.");
} else {
  alert(
    "Invito reinviato. Password temporanea: " +
      json.temporaryPassword
  );
}
}

function addStaff() {
    if (!newStaff.name.trim()) return;
    patch((prev: any) => ({ ...prev, staff: [{ id: Date.now(), ...newStaff, active: true }, ...prev.staff] }));
    setNewStaff({ name: "", role: "", trainingExpiry: "" });
  }

  function addSupplier() {
    if (!newSupplier.name.trim()) return;
    patch((prev: any) => ({ ...prev, suppliers: [{ id: Date.now(), ...newSupplier }, ...prev.suppliers] }));
    setNewSupplier({ name: "", category: "", phone: "", approved: true });
  }
async function loadCleaning() {
  if (!user || !organization) return;

  const { data, error } = await supabase
    .from("cleaning_logs")
    .select("*")
    .eq("organization_id", organization.organization_id)
    .order("created_at", { ascending: false })
    .range(0, 5000);

  if (error) {
    alert("Errore caricamento pulizie: " + error.message);
    return;
  }

  patch((prev: any) => ({
    ...prev,
    cleaning: (data || []).map((c: any) => ({
      id: c.id,
      area: c.area,
      product: c.product,
      operator: c.operator,
      date: new Date(c.created_at).toISOString().slice(0, 10),
    })),
  }));
}
async function addCleaning() {
  if (!newCleaning.area.trim()) return;
  if (!organization) return;

  const { error } = await supabase.from("cleaning_logs").insert({
    organization_id: organization.organization_id,
    user_id: user?.id,
    area: newCleaning.area,
    product: newCleaning.product,
    operator: newCleaning.operator,
  });

  if (error) {
    alert("Errore salvataggio pulizia: " + error.message);
    return;
  }

  await loadCleaning();

  setNewCleaning({
    area: "",
    product: "",
    operator: state.currentUser,
  });
}  function addAllergen() {
  if (!newAllergen.product.trim()) return;

  patch((prev: any) => ({
    ...prev,
    allergens: [
      {
        id: Date.now(),
        product: newAllergen.product,
        allergens: newAllergen.allergens,
      },
      ...(prev.allergens || []),
    ],
  }));

  setNewAllergen({
    product: "",
    allergens: "",
  });
}
function removeFrom(collection: string, id: number) {
    patch((prev: any) => ({ ...prev, [collection]: prev[collection].filter((item: any) => item.id !== id) }));
  }

  async function createReport(
  type: "temperature" | "checklist" | "nonconformities" | "products"
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text("HACCP Easy", 14, 20);

  doc.setFontSize(12);
  doc.text(`Report: ${type}`, 14, 30);
  doc.text(`Data: ${new Date().toLocaleString("it-IT")}`, 14, 38);

  let body: any[] = [];
  let head: string[] = [];

  if (type === "temperature") {
    head = ["Data", "Ora", "Area", "Temperatura", "Operatore", "Stato"];

    body = state.temperatures.map((t: any) => [
      t.date,
      t.time,
      t.area,
      `${t.value}°C`,
      t.operator,
      t.status,
    ]);
  }

  if (type === "checklist") {
    head = ["Data", "Controllo", "Area", "Stato"];

    body = state.tasks.map((t: any) => [
      t.date,
      t.title,
      t.area,
      t.done ? "Completata" : "Aperta",
    ]);
  }

  if (type === "nonconformities") {
    head = ["Data", "Problema", "Gravità", "Stato"];

    body = state.nonConformities.map((n: any) => [
      n.date,
      n.title,
      n.severity,
      n.status,
    ]);
  }

  if (type === "products") {
    head = ["Prodotto", "Lotto", "Scadenza", "Posizione"];

    body = state.products.map((p: any) => [
      p.name,
      p.lot,
      p.expiry,
      p.location,
    ]);
  }

  autoTable(doc, {
    startY: 50,
    head: [head],
    body,
  });

  doc.save(`${type}-${today}.pdf`);

  patch((prev: any) => ({
    ...prev,
    reports: [
      {
        id: Date.now(),
        type,
        filename: `${type}-${today}.pdf`,
        createdAt: new Date().toISOString(),
        generatedBy: prev.currentUser,
      },
      ...prev.reports,
    ],
  }));
}

  async function generateHistoricData() {
  if (!user || !organization?.organization_id) {
    alert("Utente o organizzazione mancante");
    return;
  }

  const ok = confirm(
    "Vuoi generare lo storico HACCP dal 01/01/2024 al 03/06/2026?"
  );

  if (!ok) return;

  const years = [2024, 2025, 2026];

  let totalTemperatures = 0;
  let totalChecklist = 0;
  let totalNonConformities = 0;

  for (const year of years) {
    try {
      alert("Inizio generazione anno " + year);

      const res = await fetch("/api/generate-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: organization.organization_id,
          userId: user.id,
          year,
        }),
      });

      const text = await res.text();

      console.log("STATUS ANNO", year, res.status);
      console.log("RISPOSTA RAW ANNO", year, text);

      let json: any = {};

      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        alert(
          "La API non ha restituito JSON valido per anno " +
            year +
            ". Controlla Console e Vercel Logs."
        );
        return;
      }

      if (!res.ok || !json.success) {
        alert(
          "Errore anno " +
            year +
            ": " +
            (json.error || text || "Errore sconosciuto")
        );
        return;
      }

      totalTemperatures += Number(json.temperatures || 0);
      totalChecklist += Number(json.checklist || 0);
      totalNonConformities += Number(json.nonConformities || 0);

      alert("Anno " + year + " completato");
    } catch (error: any) {
      console.error("Errore generazione anno", year, error);
      alert("Errore bloccante anno " + year + ": " + error.message);
      return;
    }
  }

  alert(
    "Storico generato: " +
      totalTemperatures +
      " temperature, " +
      totalChecklist +
      " checklist, " +
      totalNonConformities +
      " non conformità."
  );

  await loadTemperatures();
  await loadChecklist();
  await loadNonConformities();
}

function exportBackup() {
    downloadTextFile(`haccp-backup-${today}.json`, JSON.stringify(state, null, 2), "application/json");
  }

  function resetDemo() {
    if (confirm("Vuoi davvero ripristinare i dati demo?")) setState(clone(defaultState));
  }

 const pages = [
  ["dashboard", "dashboard", "Dashboard"],
  ["checklist", "clipboard", "Checklist"],
  ["temperature", "temp", "Temperature"],
  ["cleaning", "clipboard", "Pulizie"],
  ["magazzino", "package", "Magazzino"],
  ["etichette", "document", "Etichette"],
  ["allergeni", "alert", "Allergeni"],
  ["documenti", "document", "Documenti"],
  ["nonconformita", "alert", "Non conformità"],
  ["fornitori", "supplier", "Fornitori"],
  ["report", "report", "Report"],
  ["team", "team", "Team"],
  ["settings", "settings", "Impostazioni"],
];

if (!mounted) {
  return <div className="p-8">Caricamento...</div>;
}
if (authMode === "reset") {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Nuova password</h1>

        <p className="mt-2 text-sm text-slate-500">
          Inserisci e conferma la nuova password.
        </p>

        <div className="mt-6 space-y-3">
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Nuova password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            placeholder="Conferma nuova password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <p className="text-xs text-slate-500">
            Minimo 8 caratteri, almeno una lettera maiuscola, un numero e un simbolo.
          </p>

          <button
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
            onClick={async () => {
              const validPassword =
                password.length >= 8 &&
                /[A-Z]/.test(password) &&
                /[0-9]/.test(password) &&
                /[^A-Za-z0-9]/.test(password);

              if (!validPassword) {
                alert(
                  "La password deve avere almeno 8 caratteri, una lettera maiuscola, un numero e un simbolo."
                );
                return;
              }

              if (password !== confirmPassword) {
                alert("Le password non coincidono");
                return;
              }

             alert("password salvata. Esegui Nuovo Login");


const { data, error } = await supabase.auth.updateUser({
  password,
});

if (error) {
  alert("Errore reset: " + error.message);
  return;
}

alert("Password aggiornata. Torna al login.");

await supabase.auth.signOut();

setPassword("");
setConfirmPassword("");
setUser(null);
setOrganization(null);
setAuthMode("login");

setTimeout(() => {
  window.location.replace("/");
}, 300);            }}
          >
            Salva nuova password
          </button>
        </div>
      </div>
    </div>
  );
}
if (
  user &&
  subscription &&
  subscription.status !== "active"
) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-3xl bg-white p-10 shadow-lg text-center">
        <h1 className="text-3xl font-bold">
          Abbonamento non attivo
        </h1>

        <p className="mt-4 text-slate-500">
          Per utilizzare HACCP Easy devi attivare un piano.
        </p>

        <button
          onClick={() => (window.location.href = "/billing")}
          className="mt-6 rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white"
        >
          Vai ai piani
        </button>
      </div>
    </div>
  );
}

if (!user) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">HACCP Easy</h1>
        <p className="mt-2 text-sm text-slate-500">
          Accedi per gestire il tuo ristorante.
        </p>

        <div className="mt-6 space-y-3">
          <input
  className="w-full rounded-2xl border border-slate-200 px-4 py-3"
  placeholder="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>

{authMode !== "forgot" && (
  <input
    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
    placeholder={
      authMode === "reset"
        ? "Nuova password"
        : "Password"
    }
    type="password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
  />
)}{authMode === "forgot" && (
  <p className="text-sm text-slate-500">
    Inserisci la tua email e ti invieremo il link per reimpostare la password.
  </p>
)}

{authMode === "register" && (
  <>
    <input
      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
      placeholder="Nome ristorante"
      value={restaurantName}
      onChange={(e) => setRestaurantName(e.target.value)}
    />

    <input
      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
      placeholder="Partita IVA"
      value={vatNumber}
      onChange={(e) => setVatNumber(e.target.value)}
    />

    <input
      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
      placeholder="Indirizzo"
      value={address}
      onChange={(e) => setAddress(e.target.value)}
    />

    <input
      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
      placeholder="Responsabile HACCP"
      value={managerName}
      onChange={(e) => setManagerName(e.target.value)}
    />

    <input
      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
      placeholder="Telefono"
      value={phone}
      onChange={(e) => setPhone(e.target.value)}
    />
  </>
)}

	{authError && (
            <p className="text-sm text-rose-600">{authError}</p>
          )}

          <button
  className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
  onClick={
    authMode === "forgot"
      ? async () => {
          if (!email.trim()) {
            alert("Inserisci la tua email");
            return;
          }

          const { error } =
            await supabase.auth.resetPasswordForEmail(
              email.trim().toLowerCase(),
              {
                redirectTo:
                  "https://haccp-app-rouge.vercel.app",
              }
            );

          if (error) {
            alert(error.message);
            return;
          }

          alert("Email inviata");
          setAuthMode("login");
        }
      : handleAuth
  }
>
  {authMode === "forgot"
    ? "Invia link reset"
    : authMode === "login"
    ? "Accedi"
    : "Registrati"}
</button>
{authMode === "login" && (
  <button
    className="w-full px-4 py-2 text-sm font-semibold text-slate-500"
    onClick={() => setAuthMode("forgot")}
  >
    Password dimenticata?
  </button>
)}
          <button
            className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700"
            onClick={() => {
  if (authMode === "login") {
    setAuthMode("register");
  } else {
    setAuthMode("login");
  }
}}
          >
            {authMode === "login"
              ? "Non hai un account? Registrati"
              : "Hai già un account? Accedi"}
          </button>
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-5">
          <div className="mb-8 flex items-center gap-3"><div className="rounded-2xl bg-slate-900 p-3 text-white"><Icon name="shield" className="text-xl" /></div><div><h1 className="text-lg font-bold">HACCP Easy</h1><p className="text-xs text-slate-500">{organizationData?.name || state.restaurant.name}</p></div></div>
          <nav className="space-y-2">{pages.map(([key, icon, label]) => <NavButton key={key} active={page === key} icon={icon} label={label} onClick={() => setPage(key)} />)}</nav>
        </aside>

        <main className="p-5 md:p-8">
          {page === "dashboard" && <>
            <SectionTitle
  title="Cosa devo controllare oggi"
  subtitle="Vista operativa per cucina, sala, magazzino e responsabile HACCP."
  action={
    <div className="flex gap-2">
      <Button
        variant="secondary"
        onClick={logout}
      >
        Logout
      </Button>

      <Button onClick={() => setPage("checklist")}>
        <Icon name="plus" className="mr-2" />
        Nuovo controllo
      </Button>
    </div>
  }
/>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><StatCard icon="clipboard" label="Completamento" value={`${progress}%`} helper="Checklist del giorno" tone="bg-emerald-50" /><StatCard icon="alert" label="Alert attivi" value={alerts} helper="Richiedono verifica" tone="bg-rose-50" /><StatCard icon="calendar" label="Attività aperte" value={openTasks} helper="Da completare oggi" tone="bg-amber-50" /><StatCard icon="fridge" label="Temperature" value={state.temperatures.length} helper="Rilevazioni salvate" tone="bg-blue-50" /><StatCard icon="document" label="Doc. in scadenza" value={expiringDocs} helper="Entro 45 giorni" tone="bg-purple-50" /></div>
            <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Card><div className="p-5"><h3 className="mb-4 text-lg font-bold">Checklist di oggi</h3><div className="space-y-3">{state.tasks.slice(0, 6).map((task: any) => <div key={task.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3"><button onClick={() => toggleTask(task.id)}><span className={cx("text-2xl", task.done ? "opacity-100" : "opacity-25")}>✅</span></button><div><p className="font-medium">{task.title}</p><p className="text-xs text-slate-500">{task.area} · {task.frequency} · {task.operator || "non firmato"}</p></div></div>{task.critical && <Badge tone="danger">CCP</Badge>}</div>)}</div></div></Card><Card><div className="p-5"><h3 className="mb-4 text-lg font-bold">Alert prioritari</h3><div className="space-y-3">{state.temperatures.filter((t: any) => t.status === "alert").slice(0, 3).map((t: any) => <div key={t.id} className="rounded-2xl bg-rose-50 p-4"><div className="flex items-center justify-between"><p className="font-medium text-rose-900">{t.area}</p><Badge tone="danger">{t.value}°C</Badge></div><p className="mt-1 text-sm text-rose-700">Temperatura fuori range.</p></div>)}{state.products.filter((p: any) => p.status !== "ok").slice(0, 3).map((p: any) => <div key={p.id} className="rounded-2xl bg-amber-50 p-4"><p className="font-medium text-amber-900">{p.name}</p><p className="mt-1 text-sm text-amber-700">Scadenza: {p.expiry} · Lotto {p.lot}</p></div>)}{alerts === 0 && <p className="text-sm text-slate-500">Nessun alert attivo.</p>}</div></div></Card></div><div className="mt-6 grid gap-6 lg:grid-cols-2">

  <Card>
    <div className="p-5">
      <h3 className="mb-4 text-lg font-semibold">
        Temperature ultime registrazioni
      </h3>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={temperatureChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2563eb"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </Card>

  <Card>
    <div className="p-5">
      <h3 className="mb-4 text-lg font-semibold">
        Stato checklist
      </h3>

      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={checklistChartData}
            dataKey="value"
            nameKey="name"
            outerRadius={80}
            label
          >
            <Cell fill="#10b981" />
            <Cell fill="#ef4444" />
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </Card>

  <Card>
    <div className="p-5">
      <h3 className="mb-4 text-lg font-semibold">
        Non conformità
      </h3>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={ncChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar
            dataKey="value"
            fill="#f59e0b"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </Card>

  <Card>
    <div className="p-5">
      <h3 className="mb-4 text-lg font-semibold">
        Scadenza documenti
      </h3>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={documentChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar
            dataKey="giorni"
            fill="#3b82f6"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </Card>

</div>
          </>}

          {page === "checklist" && (
  <>
    <SectionTitle
      title="Checklist operative"
      subtitle="Crea, firma e completa i controlli giornalieri, settimanali e mensili."
    />
{YearFilter}
<Card className="mb-5"><div className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_1fr_auto_auto]"><TextInput placeholder="Nuovo controllo" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} /><TextInput placeholder="Area" value={newTask.area} onChange={(e) => setNewTask({ ...newTask, area: e.target.value })} /><SelectInput value={newTask.frequency} onChange={(e) => setNewTask({ ...newTask, frequency: e.target.value })}><option>Giornaliera</option><option>Settimanale</option><option>Mensile</option><option>Quando necessario</option></SelectInput><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newTask.critical} onChange={(e) => setNewTask({ ...newTask, critical: e.target.checked })} />CCP</label><Button onClick={addTask}>Aggiungi</Button></div></Card><div className="grid gap-4 md:grid-cols-2">{filteredTasks.map((task: any) => <Card key={task.id}><div className="flex items-center justify-between gap-4 p-5"><div><p className="font-bold">{task.title}</p><p className="mt-1 text-sm text-slate-500">{task.area} · {task.frequency} · {task.operator || "non firmato"}</p><div className="mt-2 flex gap-2">{task.critical && <Badge tone="danger">CCP</Badge>}<Badge tone={task.done ? "ok" : "warn"}>{task.done ? "Completata" : "Aperta"}</Badge></div></div><div className="flex gap-2"><Button
  variant={task.done ? "secondary" : "default"}
  onClick={() => toggleTask(task.id)}
>
  {task.done ? "Riapri" : "Firma"}
</Button><Button variant="secondary" onClick={() => removeFrom("tasks", task.id)}><Icon name="trash" /></Button></div></div></Card>)}</div></>
)}

          {page === "temperature" && (
  <>
    <SectionTitle
      title="Registro temperature"
      subtitle="Gli sforamenti generano automaticamente una non conformità."
    />

    {YearFilter}
<Card className="mb-5"><div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_auto]"><TextInput placeholder="Area, es. Frigo pesce" value={newTemp.area} onChange={(e) => setNewTemp({ ...newTemp, area: e.target.value })} /><TextInput placeholder="Temperatura °C" value={newTemp.value} onChange={(e) => setNewTemp({ ...newTemp, value: e.target.value })} /><TextInput placeholder="Operatore" value={newTemp.operator} onChange={(e) => setNewTemp({ ...newTemp, operator: e.target.value })} /><Button onClick={addTemperature}>Aggiungi</Button></div></Card><div className="space-y-3">{filteredTemperatures.map((t: any) => <Card key={t.id}><div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><p className="font-bold">{t.area}</p><p className="text-sm text-slate-500">{t.date} · {t.time} · {t.operator} · Range {t.min}/{t.max}°C</p></div><div className="flex items-center gap-3"><span className="text-2xl font-bold">{t.value}°C</span><Badge tone={t.status === "ok" ? "ok" : "danger"}>{t.status === "ok" ? "OK" : "Fuori range"}</Badge><Button variant="secondary" onClick={() => removeFrom("temperatures", t.id)}><Icon name="trash" /></Button></div></div></Card>)}</div></>)}

          {page === "cleaning" && (
  <>
    <SectionTitle
      title="Registro pulizie"
      subtitle="Registra pulizie ordinarie, sanificazioni, prodotti utilizzati e operatore."
    />

    <Card className="mb-5">
      <div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_auto]">
        <TextInput
          placeholder="Area, es. Cucina"
          value={newCleaning.area}
          onChange={(e) =>
            setNewCleaning({ ...newCleaning, area: e.target.value })
          }
        />

        <TextInput
          placeholder="Prodotto usato, es. Saniclor"
          value={newCleaning.product}
          onChange={(e) =>
            setNewCleaning({ ...newCleaning, product: e.target.value })
          }
        />

        <TextInput
          placeholder="Operatore"
          value={newCleaning.operator}
          onChange={(e) =>
            setNewCleaning({ ...newCleaning, operator: e.target.value })
          }
        />

        <Button onClick={addCleaning}>Aggiungi</Button>
      </div>
    </Card>

    <div className="space-y-3">
      {(state.cleaning || []).map((c: any) => (
        <Card key={c.id}>
          <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold">{c.area}</p>
              <p className="text-sm text-slate-500">
                {c.date} · {c.operator}
              </p>
              <p className="mt-2 text-sm">
                Prodotto utilizzato: <b>{c.product || "-"}</b>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Badge tone="ok">Registrata</Badge>
              <Button
                variant="secondary"
                onClick={() => removeFrom("cleaning", c.id)}
              >
                <Icon name="trash" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </>
)}

          {page === "magazzino" && <><SectionTitle title="Magazzino e scadenze" subtitle="Gestione lotti, FIFO, prodotti aperti e scadenze." /><Card className="mb-5"><div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"><TextInput placeholder="Prodotto" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} /><TextInput placeholder="Lotto" value={newProduct.lot} onChange={(e) => setNewProduct({ ...newProduct, lot: e.target.value })} /><TextInput type="date" value={newProduct.expiry} onChange={(e) => setNewProduct({ ...newProduct, expiry: e.target.value })} /><TextInput placeholder="Posizione" value={newProduct.location} onChange={(e) => setNewProduct({ ...newProduct, location: e.target.value })} /><TextInput placeholder="Quantità" value={newProduct.quantity} onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })} /><Button onClick={addProduct}>Aggiungi</Button></div></Card><div className="mb-5 flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm"><Icon name="search" /><input className="w-full outline-none" placeholder="Cerca prodotto, lotto o posizione" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredProducts.map((p: any) => <Card key={p.id}><div className="p-5"><div className="flex items-start justify-between"><div><p className="font-bold">{p.name}</p><p className="text-sm text-slate-500">Lotto {p.lot}</p></div><Badge tone={p.status === "ok" ? "ok" : p.status === "critico" ? "danger" : "warn"}>{p.status === "ok" ? "OK" : p.status === "critico" ? "Critico" : "In scadenza"}</Badge></div><p className="mt-4 text-sm">Scadenza: <b>{p.expiry}</b></p><p className="text-sm text-slate-500">Posizione: {p.location} · Quantità: {p.quantity || "-"}</p><div className="mt-4"><Button variant="secondary" onClick={() => removeFrom("products", p.id)}><Icon name="trash" className="mr-2" />Elimina</Button></div></div></Card>)}</div></>}

          {page === "documenti" && (
  <>
    <SectionTitle
      title="Archivio documenti"
      subtitle="Manuale HACCP, attestati, schede tecniche, analisi e contratti."
    />

    <Card className="mb-5">
      <div className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]">
        <TextInput
          placeholder="Nome documento"
          value={newDocument.name}
          onChange={(e) =>
            setNewDocument({ ...newDocument, name: e.target.value })
          }
        />

        <SelectInput
          value={newDocument.category}
          onChange={(e) =>
            setNewDocument({ ...newDocument, category: e.target.value })
          }
        >
          <option>Manuale</option>
          <option>Formazione</option>
          <option>Infestanti</option>
          <option>Analisi</option>
          <option>Scheda tecnica</option>
        </SelectInput>

        <TextInput
          placeholder="Tipo"
          value={newDocument.type}
          onChange={(e) =>
            setNewDocument({ ...newDocument, type: e.target.value })
          }
        />

        <TextInput
          type="date"
          value={newDocument.expiry}
          onChange={(e) =>
            setNewDocument({ ...newDocument, expiry: e.target.value })
          }
        />

        <input
          type="file"
          onChange={(e) =>
            setDocumentFile(e.target.files?.[0] || null)
          }
        />

        <Button onClick={addDocument}>Archivia</Button>
      </div>
    </Card>

    <div className="space-y-3">
      {state.documents.map((doc: any) => (
        <Card key={doc.id}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Icon name="document" />

              <div>
                <p className="font-bold">{doc.name}</p>

                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 underline"
                  >
                    Apri documento
                  </a>
                )}

                <p className="text-sm text-slate-500">
                  {doc.category} · {doc.type} · Valido fino al {doc.expiry}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Badge tone={daysUntil(doc.expiry) <= 45 ? "warn" : "ok"}>
                {daysUntil(doc.expiry)} giorni
              </Badge>

              <Button
                variant="secondary"
                onClick={() => removeFrom("documents", doc.id)}
              >
                <Icon name="trash" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </>
)}

          {page === "nonconformita" && (
  <>
    <SectionTitle
      title="Non conformità"
      subtitle="Problemi rilevati, gravità, azioni correttive e chiusura."
    />

    {YearFilter}
<Card className="mb-5"><div className="grid gap-3 p-5 md:grid-cols-[1.3fr_.7fr_1.5fr_1fr_auto]"><TextInput placeholder="Problema" value={newNc.title} onChange={(e) => setNewNc({ ...newNc, title: e.target.value })} /><SelectInput value={newNc.severity} onChange={(e) => setNewNc({ ...newNc, severity: e.target.value })}><option>Bassa</option><option>Media</option><option>Alta</option></SelectInput><TextInput placeholder="Azione correttiva" value={newNc.action} onChange={(e) => setNewNc({ ...newNc, action: e.target.value })} /><TextInput
  placeholder="Operatore"
  value={newNc.operator}
  onChange={(e) =>
    setNewNc({ ...newNc, operator: e.target.value })
  }
/>

<input
  type="file"
  accept="image/*"
  onChange={(e) =>
    setNcPhoto(e.target.files?.[0] || null)
  }
/>

<Button onClick={addNonConformity}>
  Apri
</Button></div></Card><div className="space-y-3">{filteredNonConformities.map((n: any) => <Card key={n.id}><div className="p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="font-bold">{n.title}</p><p className="mt-1 text-sm text-slate-500">{n.date} · Gravità {n.severity} · {n.operator}</p><p className="mt-3 text-sm">Azione correttiva: {n.action}</p>{n.photoUrl && (
  <img
    src={n.photoUrl}
    alt="Non conformità"
    className="mt-4 h-40 w-full rounded-2xl object-cover"
  />
)}</div><div className="flex gap-2"><Badge tone={n.status === "Chiusa" ? "ok" : "danger"}>{n.status}</Badge>{n.status !== "Chiusa" && <Button variant="secondary" onClick={() => closeNonConformity(n.id)}>Chiudi</Button>}</div></div></div></Card>)}</div></>)}

          {page === "fornitori" && <><SectionTitle title="Fornitori qualificati" subtitle="Elenco fornitori, categorie e stato di approvazione." /><Card className="mb-5"><div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_auto_auto]"><TextInput placeholder="Nome fornitore" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /><TextInput placeholder="Categoria" value={newSupplier.category} onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })} /><TextInput placeholder="Telefono" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newSupplier.approved} onChange={(e) => setNewSupplier({ ...newSupplier, approved: e.target.checked })} />Approvato</label><Button onClick={addSupplier}>Aggiungi</Button></div></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.suppliers.map((s: any) => <Card key={s.id}><div className="p-5"><div className="flex items-start justify-between"><div><p className="font-bold">{s.name}</p><p className="text-sm text-slate-500">{s.category} · {s.phone}</p></div><Badge tone={s.approved ? "ok" : "danger"}>{s.approved ? "Approvato" : "Non approvato"}</Badge></div></div></Card>)}</div></>}

          {page === "report" && <><SectionTitle title="Report e archivio" subtitle="Genera file HTML stampabili in PDF e conserva lo storico report generati." action={<Button variant="secondary" onClick={exportBackup}><Icon name="save" className="mr-2" />Backup JSON</Button>} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[["temperature", "Registro temperature"], ["checklist", "Checklist giornaliere"], ["nonconformities", "Non conformità"], ["products", "Magazzino e scadenze"]].map(([type, label]) => <Card key={type}><div className="p-5"><p className="font-bold">{label}</p><p className="mt-1 text-sm text-slate-500">Genera file stampabile e salvabile in PDF.</p><Button className="mt-4" onClick={() => createReport(type)}><Icon name="print" className="mr-2" />Genera</Button></div></Card>)}</div><div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]"><Card><div className="p-5"><h3 className="mb-4 text-lg font-bold">Archivio report generati</h3><div className="space-y-2">{state.reports.length === 0 && <p className="text-sm text-slate-500">Nessun report generato.</p>}{state.reports.map((r: any) => <div key={r.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm"><div><p className="font-medium">{r.filename}</p><p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("it-IT")} · {r.generatedBy}</p></div><Badge tone="blue">{r.type}</Badge></div>)}</div></div></Card><Card><div className="p-5"><h3 className="mb-4 text-lg font-bold">Test interni</h3><div className="space-y-2">{selfTests.map((result: any) => <div key={result.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm"><span>{result.name}</span><Badge tone={result.passed ? "ok" : "danger"}>{result.passed ? "PASS" : "FAIL"}</Badge></div>)}</div></div></Card></div></>}

          {page === "team" && (
  <>
    <SectionTitle
      title="Team e responsabilità"
      subtitle="Utenti, ruoli, firme digitali e formazione."
    />

    <Card className="mb-5">
      <div className="grid gap-3 p-5 md:grid-cols-[1.5fr_1fr_auto]">
        <TextInput
          placeholder="Email collaboratore"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />

       <div className="flex items-center rounded-2xl border border-slate-200 px-4 py-3 text-slate-700">
  Collaboratore
</div>

<Button onClick={inviteCollaborator}>
  Invita
</Button>   </div>
</Card>
<Card className="mb-5">
  <div className="p-5">
    <h3 className="mb-4 text-lg font-bold">
      Inviti inviati
    </h3>

    <div className="space-y-2">
      {invitations.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"
        >
          <div>
            <p className="font-medium">
              {invite.email}
            </p>

            <p className="text-sm text-slate-500">
              {invite.role}
            </p>
          </div>

          <div className="flex items-center gap-2">
  <Badge tone={invite.accepted ? "ok" : "warn"}>
    {invite.accepted
      ? "Accettato"
      : "In attesa"}
  </Badge>

  {!invite.accepted && (
    <Button
      variant="secondary"
      onClick={() => resendInvitation(invite)}
    >
      Reinvia
    </Button>
  )}
</div>
        </div>
      ))}
    </div>
  </div>
</Card>
    <Card className="mb-5">
      <div className="grid gap-3 p-5 md:grid-cols-[1fr_1fr_1fr_auto]">
        <TextInput
          placeholder="Nome"
          value={newStaff.name}
          onChange={(e) =>
            setNewStaff({ ...newStaff, name: e.target.value })
          }
        />

        <TextInput
          placeholder="Ruolo"
          value={newStaff.role}
          onChange={(e) =>
            setNewStaff({ ...newStaff, role: e.target.value })
          }
        />

        <TextInput
          type="date"
          value={newStaff.trainingExpiry}
          onChange={(e) =>
            setNewStaff({
              ...newStaff,
              trainingExpiry: e.target.value,
            })
          }
        />

        <Button onClick={addStaff}>Aggiungi</Button>
      </div>
    </Card>

    <div className="grid gap-4 md:grid-cols-3">
      {state.staff.map((person: any) => (
        <Card key={person.id}>
          <div className="p-5">
            <p className="font-bold">{person.name}</p>
            <p className="text-sm text-slate-500">{person.role}</p>
            <p className="mt-2 text-sm">
              Formazione: {person.trainingExpiry}
            </p>

            <div className="mt-3">
              <Badge
                tone={
                  daysUntil(person.trainingExpiry) <= 45
                    ? "warn"
                    : "ok"
                }
              >
                {daysUntil(person.trainingExpiry) <= 45
                  ? "Formazione in scadenza"
                  : "Attivo"}
              </Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </>
)}

          {page === "settings" && <><SectionTitle title="Impostazioni ristorante" subtitle="Configura attività, soglie HACCP e dati locali." action={
  <div className="flex gap-2">
    <Button
      variant="secondary"
      onClick={generateHistoricData}
    >
      Genera storico HACCP
    </Button>

    <Button variant="danger" onClick={resetDemo}>
      Reset demo
    </Button>
  </div>
} /><Card><div className="space-y-4 p-5"><div className="grid gap-4 md:grid-cols-2"><div><label className="text-sm font-medium">Nome attività</label><TextInput className="mt-2" value={state.restaurant.name} onChange={(e) => patch((prev: any) => ({ ...prev, restaurant: { ...prev.restaurant, name: e.target.value } }))} /></div><div><label className="text-sm font-medium">Responsabile HACCP</label><TextInput className="mt-2" value={organizationData?.manager_name ||
  state.restaurant.haccpManager} onChange={(e) => patch((prev: any) => ({ ...prev, restaurant: { ...prev.restaurant, haccpManager: e.target.value } }))} /></div><div><label className="text-sm font-medium">Indirizzo</label><TextInput className="mt-2" value={state.restaurant.address} onChange={(e) => patch((prev: any) => ({ ...prev, restaurant: { ...prev.restaurant, address: e.target.value } }))} /></div><div><label className="text-sm font-medium">Utente corrente</label><TextInput className="mt-2" value={state.currentUser} onChange={(e) => patch({ currentUser: e.target.value })} /></div><div><label className="text-sm font-medium">Limite frigo positivo °C</label><TextInput className="mt-2" type="number" value={state.restaurant.fridgeLimit} onChange={(e) => patch((prev: any) => ({ ...prev, restaurant: { ...prev.restaurant, fridgeLimit: Number(e.target.value) } }))} /></div><div><label className="text-sm font-medium">Limite freezer °C</label><TextInput className="mt-2" type="number" value={state.restaurant.freezerLimit} onChange={(e) => patch((prev: any) => ({ ...prev, restaurant: { ...prev.restaurant, freezerLimit: Number(e.target.value) } }))} /></div></div><p className="text-sm text-slate-500">I dati sono salvati nel browser con localStorage. In produzione verranno salvati su Supabase con login, permessi e storage PDF.</p></div></Card></>}
        </main>
      </div>
    </div>
  );
}
