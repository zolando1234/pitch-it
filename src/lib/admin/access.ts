/*
  Kto vidí administráciu: e-maily v premennej ADMIN_EMAILS (oddelené čiarkou).
  Bez nej len vlastník projektu.
*/

const DEFAULT_ADMINS = ["matohustak2401@gmail.com"];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  const list = raw ? raw.split(",") : DEFAULT_ADMINS;
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.trim().toLowerCase());
}
