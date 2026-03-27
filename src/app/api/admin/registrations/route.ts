import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(
        "id, created_at, registration_type, first_name, last_name, email, phone, dob, emergency_name, emergency_phone, waiver_type, waiver_signed, waiver_signed_at, waiver_submission_id, waiver_match_key, payment_status, docuseal_status, docuseal_submission_id, docuseal_sign_url"
      )
      .order("created_at", { ascending: false });

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'admin/registrations/route.ts:result',message:'Registrations query result',data:{success:!error,count:data?.length??0,error:error?JSON.stringify(error):null,paymentStatuses:data?.map((r:{email:string,payment_status:string})=>({email:r.email,payment_status:r.payment_status}))??[]},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Admin registrations fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load registrations." },
        { status: 500 }
      );
    }

    return NextResponse.json({ registrations: data ?? [] });
  } catch (err) {
    console.error("Admin registrations error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
