import "server-only";

/*
  Odoslanie e-mailu cez Resend (RESEND_API_KEY, odosielateľ EMAIL_FROM).
  Bez kľúča (lokálny vývoj) sa správa iba vypíše do logu servera.
*/

export type OutgoingEmail = { to: string; subject: string; text: string };

/** Vráti true, ak Resend správu prijal (alebo bola vypísaná do logu bez kľúča). */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info(`[email] ${email.to}: ${email.subject}\n${email.text}`);
    return true;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM?.trim() || "PitchIt <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });
  if (!response.ok) console.error("[email] odoslanie zlyhalo:", response.status);
  return response.ok;
}
