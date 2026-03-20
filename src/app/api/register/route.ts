import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RegistrationType = "adult" | "youth";

interface RegistrationPayload {
  type: RegistrationType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  emergencyName: string;
  emergencyPhone: string;
}

const VALID_REGISTRATION_TYPES = new Set<RegistrationType>(["adult", "youth"]);

const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY!;
const DOCUSEAL_ADULT_TEMPLATE_ID = process.env.DOCUSEAL_ADULT_TEMPLATE_ID!;
const DOCUSEAL_YOUTH_TEMPLATE_ID = process.env.DOCUSEAL_YOUTH_TEMPLATE_ID!;

function getWaiverType(type: RegistrationType) {
  return type === "youth" ? "youth" : "adult";
}

function getTemplateId(waiverType: string) {
  return waiverType === "youth"
    ? Number(DOCUSEAL_YOUTH_TEMPLATE_ID)
    : Number(DOCUSEAL_ADULT_TEMPLATE_ID);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RegistrationPayload>;

    const payload: RegistrationPayload = {
      type: body.type as RegistrationType,
      firstName: normalizeString(body.firstName),
      lastName: normalizeString(body.lastName),
      email: normalizeString(body.email).toLowerCase(),
      phone: normalizeString(body.phone),
      dob: normalizeString(body.dob),
      emergencyName: normalizeString(body.emergencyName),
      emergencyPhone: normalizeString(body.emergencyPhone),
    };

    if (
      !VALID_REGISTRATION_TYPES.has(payload.type) ||
      !payload.firstName ||
      !payload.lastName ||
      !payload.email ||
      !payload.phone ||
      !payload.dob ||
      !payload.emergencyName ||
      !payload.emergencyPhone
    ) {
      return NextResponse.json(
        { error: "Please complete all required registration fields." },
        { status: 400 }
      );
    }

    const waiverType = getWaiverType(payload.type);

    const { data: inserted, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        registration_type: payload.type,
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        dob: payload.dob,
        emergency_name: payload.emergencyName,
        emergency_phone: payload.emergencyPhone,
        waiver_type: waiverType,
        waiver_signed: false,
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase registration insert failed:", error);
      return NextResponse.json(
        { error: "We couldn't save your registration right now. Please try again." },
        { status: 500 }
      );
    }

    const templateId = getTemplateId(waiverType);

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/9423ad92-7622-4925-8ff4-e04b7fa95628',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cda60d'},body:JSON.stringify({sessionId:'cda60d',location:'api/register/route.ts:97',message:'DocuSeal pre-call env check',data:{apiKeyPresent:!!DOCUSEAL_API_KEY,apiKeyLength:DOCUSEAL_API_KEY?.length??0,adultTemplateRaw:process.env.DOCUSEAL_ADULT_TEMPLATE_ID,youthTemplateRaw:process.env.DOCUSEAL_YOUTH_TEMPLATE_ID,templateIdResolved:templateId,waiverType,registrationId:inserted.id},timestamp:Date.now(),hypothesisId:'A-B'})}).catch(()=>{});
    // #endregion

    const dsPayload = {
      template_id: templateId,
      send_email: false,
      submitters: [
        {
          role: "First Party",
          email: payload.email,
          name: `${payload.firstName} ${payload.lastName}`,
          metadata: { registration_id: inserted.id },
        },
      ],
    };

    const dsResponse = await fetch("https://api.docuseal.com/submissions", {
      method: "POST",
      headers: {
        "X-Auth-Token": DOCUSEAL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dsPayload),
    });

    if (!dsResponse.ok) {
      const dsErr = await dsResponse.text();
      console.error("DocuSeal submission creation failed:", dsErr);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/9423ad92-7622-4925-8ff4-e04b7fa95628',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cda60d'},body:JSON.stringify({sessionId:'cda60d',location:'api/register/route.ts:130',message:'DocuSeal API error response',data:{httpStatus:dsResponse.status,responseBody:dsErr,payloadSent:dsPayload},timestamp:Date.now(),hypothesisId:'C-D'})}).catch(()=>{});
      // #endregion
      return NextResponse.json(
        { error: "Registration saved but waiver could not be created. Please contact us." },
        { status: 500 }
      );
    }

    const dsData = await dsResponse.json();

    const submitter = Array.isArray(dsData) ? dsData[0] : dsData.submitters?.[0];
    const submissionId = submitter?.submission_id ?? dsData.id;
    const slug = submitter?.slug ?? null;

    const directSignUrl = slug
      ? `https://docuseal.com/s/${slug}`
      : (submitter?.embed_src ?? null);

    const { error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        docuseal_submission_id: submissionId,
        docuseal_sign_url: directSignUrl,
        docuseal_status: "sent",
      })
      .eq("id", inserted.id);

    if (updateErr) {
      console.error("DocuSeal column update failed (run migration?):", updateErr.message);
    }

    return NextResponse.json({
      success: true,
      signUrl: directSignUrl,
    });
  } catch (error) {
    console.error("Registration API error:", error);
    return NextResponse.json(
      { error: "Unexpected server error while saving registration." },
      { status: 500 }
    );
  }
}
