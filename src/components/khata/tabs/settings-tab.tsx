"use client";

/**
 * TAB 4 — Settings: shop profile, reminder template, data safety and the
 * demo-reset danger zone.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, TriangleAlert, Download, Store } from "lucide-react";
import type { SettingsPublic } from "@/lib/types";
import { errOf, khataFetch, khataPost } from "../api";
import { ActivityLogCard, RestoreBackupCard } from "../data-safety";

export function SettingsTab({
  settings,
  refreshAll,
}: {
  settings: SettingsPublic | null;
  refreshAll: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [shopName, setShopName] = useState("");
  const [overdueDays, setOverdueDays] = useState("30");
  const [reminderTemplate, setReminderTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sync the form whenever freshly-loaded settings arrive.
  useEffect(() => {
    if (!settings) return;
    setShopName(settings.shopName);
    setOverdueDays(String(settings.overdueDays));
    setReminderTemplate(settings.reminderTemplate);
  }, [settings]);

  const saveSettings = useCallback(async () => {
    const days = Number.parseInt(overdueDays, 10);
    if (!shopName.trim()) {
      toast({
        title: "Shop name required",
        description: "Give your shop a name — it appears on WhatsApp reminders.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      toast({
        title: "Invalid days value",
        description: "Remind dues older than (days) must be between 0 and 365.",
        variant: "destructive",
      });
      return;
    }
    if (reminderTemplate.trim().length < 10) {
      toast({
        title: "Reminder template too short",
        description: "Write at least 10 characters so the message reads naturally.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await khataFetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopName: shopName.trim(),
          overdueDays: days,
          reminderTemplate: reminderTemplate.trim(),
        }),
      });
      if (!result.ok) {
        toast({ title: "Could not save settings", description: errOf(result), variant: "destructive" });
        return;
      }
      toast({ title: "Settings saved", description: "Your shop details are up to date." });
      await refreshAll();
    } catch (e) {
      toast({ title: "Could not save settings", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [shopName, overdueDays, reminderTemplate, toast, refreshAll]);

  const resetDemo = useCallback(async () => {
    setResetting(true);
    try {
      const result = await khataPost("/api/demo/reset", {});
      if (!result.ok) {
        toast({ title: "Reset failed", description: errOf(result), variant: "destructive" });
        return;
      }
      toast({
        title: "Ledger reset to demo data",
        description: "All previous customers and transactions were erased.",
      });
      await refreshAll();
    } catch (e) {
      toast({ title: "Reset failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }, [toast, refreshAll]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* shop settings */}
      <section aria-labelledby="settings-heading">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h2
            id="settings-heading"
            className="font-serif-khata text-lg font-bold text-[#1c261f] flex items-center gap-2"
          >
            <Store className="size-5 text-[#0f5c4c]" aria-hidden="true" />
            Shop settings
          </h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shop-name" className="text-sm">
                Shop name
              </Label>
              <Input
                id="shop-name"
                value={shopName}
                placeholder="e.g. Sharma Kirana Store"
                onChange={(e) => setShopName(e.target.value)}
                className="bg-white border-[#e2d5c0]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="overdue-days" className="text-sm">
                Remind dues older than (days)
              </Label>
              <Input
                id="overdue-days"
                type="number"
                min={0}
                max={365}
                value={overdueDays}
                onChange={(e) => setOverdueDays(e.target.value)}
                className="bg-white border-[#e2d5c0] max-w-40"
              />
              <p className="text-xs text-[#5c6b62]">0 to 365 — used by the reminder scan.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reminder-template" className="text-sm">
                Reminder message template
              </Label>
              <Textarea
                id="reminder-template"
                value={reminderTemplate}
                onChange={(e) => setReminderTemplate(e.target.value)}
                className="bg-white border-[#e2d5c0] min-h-24"
              />
              <p className="text-xs text-[#5c6b62]">
                Placeholders: {"{name}"} {"{amount}"} {"{shop}"} {"{days}"} — amount is
                in rupees
              </p>
            </div>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={saving || !settings}
              className="bg-[#0f5c4c] text-white hover:bg-[#0a3f35]"
            >
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save settings
            </Button>
          </div>
        </div>
      </section>

      {/* data safety */}
      <section aria-labelledby="safety-heading">
        <div className="khata-card rounded-2xl p-4 sm:p-5">
          <h2
            id="safety-heading"
            className="font-serif-khata text-lg font-bold text-[#1c261f] flex items-center gap-2"
          >
            <ShieldCheck className="size-5 text-[#0f5c4c]" aria-hidden="true" />
            Data safety
          </h2>
          <p className="mt-2 text-sm text-[#5c6b62]">
            Backups include customers, transactions, reminders and audit history.
            Export regularly and keep the file safe.
          </p>
          <Button asChild variant="outline" className="mt-3 border-[#e2d5c0] text-[#0f5c4c] hover:bg-[#0f5c4c]/10">
            <a href="/api/export/backup.json" download>
              <Download className="size-4" aria-hidden="true" />
              Download full backup (JSON)
            </a>
          </Button>
          <RestoreBackupCard refreshAll={refreshAll} />
        </div>
      </section>

      {/* danger zone */}
      <section aria-labelledby="danger-heading">
        <div className="rounded-2xl border border-[#9b2c2c]/50 bg-[#9b2c2c]/5 p-4 sm:p-5">
          <h2
            id="danger-heading"
            className="font-serif-khata text-lg font-bold text-[#9b2c2c] flex items-center gap-2"
          >
            <TriangleAlert className="size-5" aria-hidden="true" />
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-[#5c6b62]">
            Reset to demo data — erases the current ledger and replaces it with a
            small clearly-labeled demo dataset.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={resetting}
                className="mt-3 border-[#9b2c2c] text-[#9b2c2c] hover:bg-[#9b2c2c]/10"
              >
                {resetting && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                Reset to demo data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="khata-card max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-serif-khata text-[#1c261f]">
                  Reset to demo data?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[#5c6b62]">
                  This erases ALL current customers and transactions and replaces them
                  with a small clearly-labeled demo dataset. Only do this on a shop
                  ledger you are testing.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-[#e2d5c0] text-[#5c6b62]">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-[#9b2c2c] text-white hover:bg-[#7a231f]"
                  onClick={resetDemo}
                >
                  Erase &amp; reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      {/* activity log (audit trail) */}
      <section aria-labelledby="activity-heading">
        <ActivityLogCard />
      </section>

      <p className="text-xs text-[#5c6b62]">
        This local demo has no login. Do not store real customer data here; see the
        roadmap for multi-user auth.
      </p>
    </div>
  );
}
