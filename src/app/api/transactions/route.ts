import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parse } from "@/lib/parser";
import {
  addTransaction,
  RUPEE_MAX,
} from "@/lib/khata";
import { rupeesToPaise } from "@/lib/format";

const nameRegex = /^[A-Za-z][A-Za-z .']{0,59}$/;

const txnSchema = z.object({
  mode: z.enum(["parse", "manual"]).default("manual"),
  text: z.string().max(300).optional(),
  customer: z.string().max(60).optional(),
  amountRupees: z.number().positive().finite().max(RUPEE_MAX).optional(),
  txnType: z.enum(["UDHAAR", "PAYMENT"]).optional(),
  phone: z.string().max(20).optional(),
  note: z.string().max(200).optional(),
  force: z.boolean().optional(),
  /** parse mode only: return the parsed fields WITHOUT saving (explicit confirm flow). */
  preview: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsedBody = txnSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: parsedBody.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    const body = parsedBody.data;

    let customer: string;
    let amountPaise: number;
    let txnType: "UDHAAR" | "PAYMENT";
    let rawText: string;

    if (body.mode === "parse") {
      // Natural-language mode: the sentence is parsed server-side, but the
      // frontend ALWAYS shows a confirm step before calling with mode=parse,
      // so no transaction is ever created silently by the parser.
      if (!body.text || !body.text.trim()) {
        return NextResponse.json(
          { ok: false, error: "Please enter a sentence to parse." },
          { status: 400 }
        );
      }
      const parsed = parse(body.text);
      if (!parsed.ok) {
        return NextResponse.json(
          { ok: false, error: parsed.error, parsed },
          { status: 400 }
        );
      }
      // Preview: parse only, never save — the user must confirm explicitly.
      if (body.preview) {
        return NextResponse.json({
          ok: true,
          preview: {
            customer: parsed.customer,
            amount: parsed.amount,
            txnType: body.txnType ?? parsed.txnType,
            rawText: parsed.rawText,
          },
        });
      }
      customer = parsed.customer!;
      amountPaise = rupeesToPaise(parsed.amount!);
      txnType = body.txnType ?? parsed.txnType!; // allow the user to correct the type
      rawText = parsed.rawText;
    } else {
      // Manual mode: explicit structured entry — requires every field.
      if (!body.customer || !nameRegex.test(body.customer.trim())) {
        return NextResponse.json(
          { ok: false, error: "Enter a valid customer name (letters, spaces, dots)." },
          { status: 400 }
        );
      }
      if (body.amountRupees === undefined) {
        return NextResponse.json(
          { ok: false, error: "Amount is required." },
          { status: 400 }
        );
      }
      if (!body.txnType) {
        return NextResponse.json(
          { ok: false, error: "Choose Udhaar (credit given) or Payment (cash received)." },
          { status: 400 }
        );
      }
      customer = body.customer.trim();
      amountPaise = rupeesToPaise(body.amountRupees);
      txnType = body.txnType;
      rawText = body.note?.trim() || `Manual ${txnType === "UDHAAR" ? "udhaar" : "payment"} entry`;
    }

    if (amountPaise <= 0) {
      return NextResponse.json(
        { ok: false, error: "Amount must be greater than zero." },
        { status: 400 }
      );
    }

    const result = await addTransaction({
      customer,
      amountPaise,
      txnType,
      rawText,
      note: body.note ?? null,
      phone: body.phone ?? null,
      force: body.force,
    });

    if (result.duplicate) {
      const d = result.duplicate;
      return NextResponse.json(
        {
          ok: false,
          error: `Possible duplicate: ${d.txnType === "UDHAAR" ? "udhaar" : "payment"} of ₹${(d.amountPaise / 100).toFixed(2)} for ${d.name} was recorded a moment ago. Save anyway?`,
          duplicate: d,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        transaction: result.transaction,
        customer: result.customer,
        /** present when this udhaar crossed the customer's credit cap */
        overLimit: result.overLimit ?? null,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
