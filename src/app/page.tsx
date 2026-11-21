"use client";

/**
 * Udhaar Khata — single-page app shell.
 * 4 tabs (Khata / Customers / Reports / Settings) under a teal gradient header,
 * sticky tab bar, paper background, sticky footer.
 */

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpenText, Users, BarChart3, Settings2 } from "lucide-react";
import type { CustomerPublic, ReportsResponse, SettingsPublic } from "@/lib/types";
import { errOf, khataFetch } from "@/components/khata/api";
import { KhataTab } from "@/components/khata/tabs/khata-tab";
import { CustomersTab } from "@/components/khata/tabs/customers-tab";
import { ReportsTab } from "@/components/khata/tabs/reports-tab";
import { SettingsTab } from "@/components/khata/tabs/settings-tab";

export default function Home() {
  const [tab, setTab] = useState("khata");
  const [customers, setCustomers] = useState<CustomerPublic[]>([]);
  const [todayReport, setTodayReport] = useState<ReportsResponse | null>(null);
  const [settings, setSettings] = useState<SettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [demoDismissed, setDemoDismissed] = useState(false);

  /**
   * The one data-loading function: fetches customers + today's report + settings
   * in parallel. Called on mount and after any mutation across all tabs.
   * Note: all state updates happen after the first `await`, never synchronously
   * inside the mount effect.
   */
  const refreshAll = useCallback(async () => {
    const [cust, rep, st] = await Promise.allSettled([
      khataFetch<{ ok: boolean; error?: string; customers?: CustomerPublic[] }>(
        "/api/customers"
      ),
      khataFetch<ReportsResponse & { ok?: boolean; error?: string }>(
        "/api/reports?range=today"
      ),
      khataFetch<{ ok: boolean; error?: string; settings?: SettingsPublic }>(
        "/api/settings"
      ),
    ]);

    let firstError = "";

    if (cust.status === "fulfilled" && cust.value.ok) {
      setCustomers(cust.value.data.customers ?? []);
    } else if (cust.status === "fulfilled") {
      firstError = errOf(cust.value, "Could not load customers.");
    } else {
      firstError = (cust.reason as Error).message;
    }

    if (rep.status === "fulfilled" && rep.value.ok) {
      setTodayReport(rep.value.data);
    } else if (!firstError) {
      firstError =
        rep.status === "fulfilled"
          ? errOf(rep.value, "Could not load today's activity.")
          : (rep.reason as Error).message;
    }

    if (st.status === "fulfilled" && st.value.ok && st.value.data.settings) {
      setSettings(st.value.data.settings);
    } else if (!firstError) {
      firstError =
        st.status === "fulfilled"
          ? errOf(st.value, "Could not load settings.")
          : (st.reason as Error).message;
    }

    setLoadError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Defer the first load to after mount so no state is set synchronously
    // inside the effect body.
    const t = setTimeout(() => {
      void refreshAll();
    }, 0);
    return () => clearTimeout(t);
  }, [refreshAll]);

  const tabTriggerClass =
    "gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 sm:px-5 " +
    "text-[#5c6b62] font-semibold min-w-[88px] " +
    "data-[state=active]:bg-transparent data-[state=active]:text-[#0f5c4c] " +
    "data-[state=active]:shadow-none data-[state=active]:border-[#0f5c4c]";

  return (
    <div className="khata-paper min-h-screen flex flex-col">
      {/* ---------- header ---------- */}
      <header className="bg-gradient-to-br from-[#0a3f35] to-[#0f5c4c] text-[#f8f3ea] px-4 py-8 sm:py-10">
        <div className="max-w-5xl mx-auto">
          <p className="uppercase tracking-[0.14em] text-xs opacity-80 mb-1.5">
            Kirana credit ledger
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif-khata text-3xl sm:text-4xl font-bold">
              Udhaar Khata
            </h1>
            {settings && (
              <span
                className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold"
                aria-label={`Shop: ${settings.shopName}`}
              >
                {settings.shopName}
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed opacity-90">
            Type, speak, or type it manually — the ledger updates with your
            confirmation, and WhatsApp reminders keep dues moving.
          </p>
        </div>
      </header>

      {/* ---------- main + tabs ---------- */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 pb-10">
        {loadError && (
          <p role="alert" className="mt-4 text-sm font-medium text-[#9b2c2c]">
            {loadError}
          </p>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          {/* sticky tab bar */}
          <div className="sticky top-0 z-40 -mx-3 sm:-mx-6 px-3 sm:px-6 bg-[#f3eadb]/95 backdrop-blur-sm border-b border-[#e2d5c0]">
            <TabsList className="h-12 w-full justify-start rounded-none bg-transparent p-0 overflow-x-auto khata-scroll">
              <TabsTrigger value="khata" className={tabTriggerClass}>
                <BookOpenText className="size-4" aria-hidden="true" />
                Khata
              </TabsTrigger>
              <TabsTrigger value="customers" className={tabTriggerClass}>
                <Users className="size-4" aria-hidden="true" />
                Customers
              </TabsTrigger>
              <TabsTrigger value="reports" className={tabTriggerClass}>
                <BarChart3 className="size-4" aria-hidden="true" />
                Reports
              </TabsTrigger>
              <TabsTrigger value="settings" className={tabTriggerClass}>
                <Settings2 className="size-4" aria-hidden="true" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="khata" className="mt-5">
            <KhataTab
              customers={customers}
              todayReport={todayReport}
              loading={loading}
              demoData={settings?.demoData ?? false}
              demoDismissed={demoDismissed}
              onDismissDemo={() => setDemoDismissed(true)}
              refreshAll={refreshAll}
            />
          </TabsContent>

          <TabsContent value="customers" className="mt-5">
            <CustomersTab refreshAll={refreshAll} />
          </TabsContent>

          <TabsContent value="reports" className="mt-5">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="settings" className="mt-5">
            <SettingsTab settings={settings} refreshAll={refreshAll} />
          </TabsContent>
        </Tabs>
      </main>

      {/* ---------- sticky footer ---------- */}
      <footer className="mt-auto border-t border-[#e2d5c0] bg-[#efe4d2]/60 px-4 py-5 text-center text-xs text-[#5c6b62]">
        <p>
          Next.js rebuild of Udhaar Khata (
          <a
            href="https://github.com/aaron-samuvel/udhaar-khata"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#0f5c4c] hover:underline"
          >
            github.com/aaron-samuvel/udhaar-khata
          </a>
          ) · Parser runs locally, ledger in Prisma + SQLite, reminders via wa.me deep
          links.
        </p>
        <p className="mt-1">Demo build — do not store real customer data.</p>
      </footer>
    </div>
  );
}
