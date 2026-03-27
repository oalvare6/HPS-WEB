import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'admin/payments/route.ts:query',message:'Fetching payments from Supabase',data:{},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    // Fetch all payments, joined with the registration name when available
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(
        `id, created_at, email, amount, currency, tournament_name,
         stripe_session_id, stripe_payment_intent_id, status, notes,
         registrations ( first_name, last_name )`
      )
      .order("created_at", { ascending: false });

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'admin/payments/route.ts:result',message:'Payments query result',data:{success:!error,count:data?.length??0,error:error?JSON.stringify(error):null,firstPayment:data?.[0]??null},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Admin payments fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load payments." },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: data ?? [] });
  } catch (err) {
    console.error("Admin payments error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
