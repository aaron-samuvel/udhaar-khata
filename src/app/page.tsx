"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Mic,
  MicOff,
  Loader2,
  Plus,
  BookOpenText,
  Users,
  Wallet,
  CircleCheck,
  BellRing,
  IndianRupee,
  History,
} from "lucide-react";

/* ---------- minimal Web Speech API types ---------- */
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionResultList {
  0: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognition;

/* ---------- shared types ---------- */
interface Customer {
  name: string;
  nameKey: string;
  balance: number;
  phone: string | null;
  firstDueAt: string | null;
  lastTxnAt: string | null;
  createdAt: string;
}
interface Txn {
  id: string;
  name: string;
  amount: number;
  txnType: "UDHAAR" | "PAYMENT";
  rawText: string;
  createdAt: string;
}
interface Reminder {
  id: string;
  name: string;
  balance: number;
  daysOverdue: number;
  phone: string | null;
  whatsappUrl: string;
  message: string;
  runId: string;
  createdAt: string;
}

const fmt = (n: number) =>
  "₹" +
  Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const EXAMPLES = [
  "Ramesh took 2 kg rice for 120 rupees",
  "Ramesh paid 50",
  "Amit ne 200 ka udhaar liya",
  "Sita diya 50",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function daysOverdue(iso: string | null): number {
  if (!iso) return 0;
  const delta = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(delta / 86_400_000));
}

/* =====================  PAGE  ===================== */
export default function Home() {
  const { toast } = useToast();

  const [sentence, setSentence] = useState("");
  const [phone, setPhone] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Txn[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  const [adding, setAdding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [status, setStatus] = useState<{ msg: string; kind: "ok" | "error" | "" }>(
    { msg: "", kind: "" }
  );
  const [remindStatus, setRemindStatus] = useState<{ msg: string; kind: "ok" | "error" | "" }>(
    { msg: "", kind: "" }
  );

  // voice input state
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadCustomers = useCallback(async () => {
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load customers.");
    setCustomers(data.customers ?? []);
  }, []);

  const loadReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      const data = await res.json();
      if (res.ok) setReminders(data.reminders ?? []);
    } catch {
      /* reminders are non-critical on first load */
    }
  }, []);

  useEffect(() => {
    // Check for Web Speech API support once on mount.
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));

    Promise.all([loadCustomers(), loadReminders()])
      .catch((err: Error) =>
        setStatus({ msg: err.message, kind: "error" })
      )
      .finally(() => setLoadingData(false));
  }, [loadCustomers, loadReminders]);

  /* ---------- add entry ---------- */
  const addEntry = useCallback(async () => {
    const text = sentence.trim();
    if (!text) {
      setStatus({
        msg: "Please enter a sentence, for example: 'Ramesh took 2 kg rice for 120 rupees'.",
        kind: "error",
      });
      return;
    }
    setAdding(true);
    setStatus({ msg: "Saving…", kind: "" });
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the entry.");

      const c = data.customer as Customer;
      const verb = data.parsed.txnType === "PAYMENT" ? "payment" : "udhaar";
      setStatus({
        msg: `${c.name}: recorded ${verb} of ${fmt(data.parsed.amount)}. Balance is now ${fmt(c.balance)}.`,
        kind: "ok",
      });
      setSentence("");
      await loadCustomers();
      if (selected && selected.nameKey === c.nameKey.toUpperCase()) {
        await showHistory(c.name);
      }
      toast({
        title: data.parsed.txnType === "PAYMENT" ? "Payment recorded" : "Udhaar recorded",
        description: `${c.name} · ${fmt(data.parsed.amount)} · balance ${fmt(c.balance)}`,
      });
    } catch (err) {
      setStatus({ msg: (err as Error).message, kind: "error" });
    } finally {
      setAdding(false);
    }
  }, [sentence, phone, loadCustomers, selected, toast]);

  /* ---------- customer history ---------- */
  const showHistory = useCallback(async (name: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/customers/${encodeURIComponent(name)}/transactions`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load the khata.");
      setSelected(data.customer);
      setHistory(data.transactions ?? []);
    } catch (err) {
      setStatus({ msg: (err as Error).message, kind: "error" });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  /* ---------- reminders ---------- */
  const generateReminders = useCallback(async () => {
    setGenerating(true);
    setRemindStatus({ msg: "Scanning the ledger for overdue dues…", kind: "" });
    try {
      const res = await fetch("/api/reminders/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(demoMode ? { overdue_days: 0 } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reminder run failed.");
      const n = data.reminders_written as number;
      setRemindStatus({
        msg: `Wrote ${n} reminder record${n === 1 ? "" : "s"}.`,
        kind: "ok",
      });
      await loadReminders();
      toast({
        title: "Reminder run complete",
        description: `${n} WhatsApp reminder link${n === 1 ? "" : "s"} generated.`,
      });
    } catch (err) {
      setRemindStatus({ msg: (err as Error).message, kind: "error" });
    } finally {
      setGenerating(false);
    }
  }, [demoMode, loadReminders, toast]);

  /* ---------- voice input ---------- */
  const stopListening = useCallback(() => {
    setListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    setStatus({ msg: "Transcribing your recording…", kind: "" });
    const buf = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audio_base64: btoa(binary) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not transcribe the audio.");
    setSentence(data.text);
    setStatus({ msg: "Captured speech. Check the line and press Add.", kind: "ok" });
  }, []);

  const toggleMic = useCallback(async () => {
    if (listening) {
      stopListening();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        setSentence(event.results[0][0].transcript);
        setStatus({ msg: "Captured speech. Check the line and press Add.", kind: "ok" });
      };
      rec.onerror = () => {
        setStatus({ msg: "Could not capture speech. You can type the line instead.", kind: "error" });
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      try {
        rec.start();
        setListening(true);
        setStatus({ msg: "Listening…", kind: "" });
      } catch {
        setListening(false);
      }
      return;
    }

    // Fallback: record with MediaRecorder and transcribe via the backend.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        try {
          await transcribeBlob(new Blob(chunksRef.current, { type: mime }));
        } catch (err) {
          setStatus({ msg: (err as Error).message, kind: "error" });
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setListening(true);
      setStatus({ msg: "Recording… click the mic again to finish.", kind: "" });
    } catch {
      setStatus({
        msg: "Voice input is not supported here. Please type the line instead.",
        kind: "error",
      });
    }
  }, [listening, stopListening, transcribeBlob]);

  /* ---------- derived stats ---------- */
  const totalOutstanding = customers.reduce(
    (sum, c) => sum + Math.max(0, c.balance),
    0
  );
  const withDues = customers.filter((c) => c.balance > 0).length;
  const settled = customers.filter((c) => c.balance <= 0).length;

  return (
    <div className="khata-paper min-h-screen flex flex-col">
      {/* ---------- header ---------- */}
      <header className="bg-gradient-to-br from-[#0a3f35] to-[#0f5c4c] text-[#f8f3ea] px-4 py-8 sm:py-10">
        <div className="max-w-5xl mx-auto">
          <p className="uppercase tracking-[0.12em] text-xs opacity-80 mb-1">
            Kirana credit ledger
          </p>
          <h1 className="font-serif-khata text-3xl sm:text-4xl font-bold flex items-center gap-3">
            <BookOpenText className="h-8 w-8 shrink-0" aria-hidden="true" />
            Udhaar Khata
          </h1>
          <p className="mt-2 max-w-2xl text-[#e8ddd0]">
            Type or speak a line the way you would write it in a paper khata. The
            shop ledger updates at once, and overdue dues get a WhatsApp reminder
            link.
          </p>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* entry card */}
        <section className="khata-card rounded-2xl p-4 sm:p-6" aria-labelledby="entry-heading">
          <label htmlFor="sentence" className="block font-semibold mb-1 text-[#1c261f]">
            New entry <span className="font-normal text-[#5c6b62]">· English or Hinglish</span>
          </label>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-[#5c6b62] mt-1 mb-3">
            <span>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setSentence(ex);
                  document.getElementById("sentence")?.focus();
                }}
                className="underline decoration-dotted underline-offset-2 text-[#0f5c4c] font-semibold hover:text-[#0a3f35] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              id="sentence"
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addEntry();
              }}
              placeholder="Ramesh took 2 kg rice for 120 rupees"
              autoComplete="off"
              className="flex-1 min-w-[220px] bg-white border-[#e2d5c0] h-11 text-[#1c261f] focus-visible:ring-[#0f5c4c]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleMic}
              aria-label={listening ? "Stop listening" : "Speak the entry"}
              title={
                speechSupported
                  ? "Speak with the microphone"
                  : "Speech recognition unavailable — records and transcribes instead"
              }
              className={`h-11 w-11 shrink-0 border border-[#e2d5c0] bg-[#efe4d2] text-[#1c261f] hover:bg-[#e5d6bd] ${
                listening ? "bg-[#9b2c2c] text-white hover:bg-[#7a2323] khata-listening" : ""
              }`}
            >
              {listening ? (
                <MicOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Mic className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              onClick={addEntry}
              disabled={adding}
              className="h-11 px-5 shrink-0 bg-[#0f5c4c] hover:bg-[#0a3f35] text-white font-semibold"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Add
            </Button>
          </div>
          <div className="mt-3">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Optional phone (10 digits) for WhatsApp reminders"
              aria-label="Optional customer phone number"
              className="bg-white border-[#e2d5c0] h-10 text-[#1c261f] focus-visible:ring-[#0f5c4c]"
            />
          </div>
          <p
            aria-live="polite"
            className={`mt-3 min-h-[1.3rem] text-sm ${
              status.kind === "error"
                ? "text-[#9b2c2c]"
                : status.kind === "ok"
                  ? "text-[#0f5c4c] font-medium"
                  : "text-[#5c6b62]"
            }`}
          >
            {status.msg}
          </p>
        </section>

        {/* stats */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Ledger summary">
          <div className="khata-card rounded-2xl p-4 flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-[#fde8d0] flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-[#c56a16]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-[#5c6b62]">Total outstanding</p>
              <p className="font-serif-khata text-xl font-bold text-[#1c261f]">
                {loadingData ? "…" : fmt(totalOutstanding)}
              </p>
            </div>
          </div>
          <div className="khata-card rounded-2xl p-4 flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-[#fde8d0] flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-[#c56a16]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-[#5c6b62]">Customers with dues</p>
              <p className="font-serif-khata text-xl font-bold text-[#1c261f]">
                {loadingData ? "…" : withDues}
              </p>
            </div>
          </div>
          <div className="khata-card rounded-2xl p-4 flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-[#e3efe9] flex items-center justify-center shrink-0">
              <CircleCheck className="h-5 w-5 text-[#0f5c4c]" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-[#5c6b62]">Settled customers</p>
              <p className="font-serif-khata text-xl font-bold text-[#1c261f]">
                {loadingData ? "…" : settled}
              </p>
            </div>
          </div>
        </section>

        {/* customers + reminders */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* customers */}
          <div className="lg:col-span-3 khata-card rounded-2xl p-4 sm:p-6">
            <h2
              id="customers-heading"
              className="font-serif-khata text-xl font-bold mb-3 text-[#1c261f] flex items-center gap-2"
            >
              <Users className="h-5 w-5 text-[#c56a16]" aria-hidden="true" />
              Customers
            </h2>
            <div className="max-h-96 overflow-y-auto khata-scroll flex flex-col gap-2 pr-1" role="list">
              {!loadingData && customers.length === 0 && (
                <p className="text-sm text-[#5c6b62]">No udhaar yet.</p>
              )}
              {loadingData &&
                [0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-xl bg-[#f0e6d4] animate-pulse"
                    aria-hidden="true"
                  />
                ))}
              {customers.map((c) => {
                const due = c.balance > 0;
                const isActive = selected?.nameKey === c.nameKey;
                return (
                  <button
                    key={c.nameKey}
                    type="button"
                    role="listitem"
                    onClick={() => showHistory(c.name)}
                    className={`flex items-center justify-between gap-3 text-left rounded-xl border px-4 py-3 bg-white transition-colors hover:border-[#0f5c4c] ${
                      isActive ? "border-[#0f5c4c] ring-1 ring-[#0f5c4c]" : "border-[#e2d5c0]"
                    }`}
                    aria-label={`Open khata for ${c.name}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#1c261f] truncate">
                        {c.name}
                        {c.phone ? (
                          <span className="text-[#5c6b62] font-normal"> · {c.phone}</span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-[#5c6b62]">
                        {c.lastTxnAt ? `updated ${timeAgo(c.lastTxnAt)}` : "no entries yet"}
                        {due && c.firstDueAt
                          ? ` · due since ${daysOverdue(c.firstDueAt)} day${daysOverdue(c.firstDueAt) === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-bold ${
                        due ? "text-[#9b2c2c]" : "text-[#0f5c4c]"
                      }`}
                    >
                      {due ? `${fmt(c.balance)} due` : "settled"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* selected customer history */}
            {selected && (
              <div className="mt-5 border-t border-dashed border-[#e2d5c0] pt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-serif-khata text-lg font-bold text-[#1c261f] flex items-center gap-2">
                    <History className="h-4 w-4 text-[#c56a16]" aria-hidden="true" />
                    Khata for {selected.name}
                  </h3>
                  <Badge
                    className={
                      selected.balance > 0
                        ? "bg-[#9b2c2c] hover:bg-[#9b2c2c] text-white"
                        : "bg-[#0f5c4c] hover:bg-[#0f5c4c] text-white"
                    }
                  >
                    {selected.balance > 0 ? `${fmt(selected.balance)} due` : "settled"}
                  </Badge>
                </div>
                {historyLoading ? (
                  <div className="space-y-2">
                    <div className="h-10 rounded-lg bg-[#f0e6d4] animate-pulse" aria-hidden="true" />
                    <div className="h-10 rounded-lg bg-[#f0e6d4] animate-pulse" aria-hidden="true" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-[#5c6b62]">No lines yet.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto khata-scroll pr-1">
                    {history.map((t) => (
                      <div
                        key={t.id}
                        className="py-2 border-b border-dashed border-[#e2d5c0] last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-semibold ${
                              t.txnType === "UDHAAR" ? "text-[#9b2c2c]" : "text-[#0f5c4c]"
                            }`}
                          >
                            {t.txnType === "UDHAAR" ? "Udhaar" : "Payment"}{" "}
                            {t.txnType === "UDHAAR" ? "+" : "−"}
                            {fmt(t.amount)}
                          </span>
                          <span className="text-xs text-[#5c6b62] shrink-0">
                            {timeAgo(t.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-[#5c6b62] italic mt-0.5">
                          &ldquo;{t.rawText}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* reminders */}
          <div className="lg:col-span-2 khata-card rounded-2xl p-4 sm:p-6">
            <h2
              id="reminders-heading"
              className="font-serif-khata text-xl font-bold mb-2 text-[#1c261f] flex items-center gap-2"
            >
              <BellRing className="h-5 w-5 text-[#c56a16]" aria-hidden="true" />
              Reminders
            </h2>
            <p className="text-sm text-[#5c6b62] mb-3">
              The daily run scans dues at 9:00 AM India time. For a quick demo,
              generate reminders now.
            </p>
            <label className="flex items-center gap-2 text-sm text-[#5c6b62] mb-3 cursor-pointer">
              <Checkbox
                id="demoMode"
                checked={demoMode}
                onCheckedChange={(v) => setDemoMode(v === true)}
                className="border-[#c56a16] data-[state=checked]:bg-[#c56a16] data-[state=checked]:border-[#c56a16]"
              />
              Include today&rsquo;s dues (demo mode)
            </label>
            <Button
              type="button"
              onClick={generateReminders}
              disabled={generating}
              className="w-full bg-[#0f5c4c] hover:bg-[#0a3f35] text-white font-semibold"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Generate reminders
            </Button>
            <p
              aria-live="polite"
              className={`mt-2 text-sm min-h-[1.3rem] ${
                remindStatus.kind === "error"
                  ? "text-[#9b2c2c]"
                  : remindStatus.kind === "ok"
                    ? "text-[#0f5c4c] font-medium"
                    : "text-[#5c6b62]"
              }`}
            >
              {remindStatus.msg}
            </p>

            <div className="mt-3 max-h-96 overflow-y-auto khata-scroll flex flex-col gap-2 pr-1" role="list">
              {reminders.length === 0 && (
                <p className="text-sm text-[#5c6b62]">No reminder records yet.</p>
              )}
              {reminders.map((r) => (
                <div
                  key={r.id}
                  role="listitem"
                  className="rounded-xl border border-[#e2d5c0] bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#1c261f]">{r.name}</span>
                    <span className="font-bold text-[#9b2c2c]">{fmt(r.balance)}</span>
                  </div>
                  <p className="text-xs text-[#5c6b62] mt-0.5">
                    {r.daysOverdue} day{r.daysOverdue === 1 ? "" : "s"} overdue
                    {r.phone ? ` · ${r.phone}` : ""}
                  </p>
                  <a
                    href={r.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-[#128c7e] hover:bg-[#0e7265] text-white text-sm font-semibold px-3 py-1.5 transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 fill-current"
                      aria-hidden="true"
                    >
                      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 17.94h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22m4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.12-.22-.18-.47-.3" />
                    </svg>
                    WhatsApp reminder
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* how it works */}
        <section className="khata-card rounded-2xl p-4 sm:p-6" aria-labelledby="how-heading">
          <h2 id="how-heading" className="font-serif-khata text-xl font-bold mb-3 text-[#1c261f]">
            How the khata works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#5c6b62]">
            <div>
              <p className="font-semibold text-[#0f5c4c] flex items-center gap-1.5 mb-1">
                <IndianRupee className="h-4 w-4" aria-hidden="true" /> 1. Say it plainly
              </p>
              Type or speak &ldquo;Ramesh took 2 kg rice for 120 rupees&rdquo; — Hinglish
              like &ldquo;Amit ne 200 ka udhaar liya&rdquo; works too.
            </div>
            <div>
              <p className="font-semibold text-[#0f5c4c] flex items-center gap-1.5 mb-1">
                <Wallet className="h-4 w-4" aria-hidden="true" /> 2. Ledger updates
              </p>
              The parser finds the customer, amount and type, then updates the running
              balance with an immutable ledger line.
            </div>
            <div>
              <p className="font-semibold text-[#0f5c4c] flex items-center gap-1.5 mb-1">
                <BellRing className="h-4 w-4" aria-hidden="true" /> 3. Gentle nudges
              </p>
              The daily reminder run finds overdue dues and prepares a WhatsApp message
              ready to send with one tap.
            </div>
          </div>
        </section>
      </main>

      {/* ---------- footer (sticky bottom) ---------- */}
      <footer className="mt-auto w-full max-w-5xl mx-auto px-4 pb-6 pt-2 text-sm text-[#5c6b62]">
        <div className="border-t border-[#e2d5c0] pt-4">
          Next.js rebuild of{" "}
          <a
            href="https://github.com/aaron-samuvel/udhaar-khata"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#0f5c4c] hover:underline"
          >
            Udhaar Khata
          </a>{" "}
          · Parser runs locally, ledger stored in Prisma + SQLite, reminders via wa.me
          deep links. Demo only — do not store real customer data.
        </div>
      </footer>
    </div>
  );
}
