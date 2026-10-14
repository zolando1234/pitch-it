import { AccountMenu, type AccountSummary } from "@/components/app/header-menus";
import { HeaderRow } from "@/components/app/header-row";
import { MobileNavToggle } from "@/components/app/mobile-nav";
import { Wordmark } from "@/components/wordmark";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/admin/access";
import { getProfile } from "@/lib/db/profile";

export function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Mobilná lišta (menu, logo, upozornenia, účet) a na desktope riadok s pozdravom alebo omrvinkami. */
export function TopBar({
  account,
  firstName,
}: {
  account: AccountSummary;
  firstName: string | null;
}) {
  return (
    <>
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-ink/95 px-4 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNavToggle />
          <Wordmark href="/app" className="[&_svg]:h-7 [&>span]:text-[22px]" />
        </div>
        <div className="flex items-center gap-2.5">
          <AccountMenu account={account} compact />
        </div>
      </div>
      <HeaderRow firstName={firstName} dashboardPath="/app">
        <AccountMenu account={account} />
      </HeaderRow>
    </>
  );
}

/** Číta reláciu, preto je vždy vo vnútri <Suspense>. */
export async function TopBarLoader() {
  const user = await getCurrentUser();
  if (!user) return <TopBarSkeleton />;
  const profile = await getProfile(user.id);
  const name = profile?.display_name?.trim() || null;
  return (
    <TopBar
      firstName={name ? name.split(/\s+/)[0] : null}
      account={{ name: name ?? user.email?.split("@")[0] ?? "Účet", email: user.email, initials: initials(name, user.email), role: "Founder", admin: isAdminEmail(user.email) }}
    />
  );
}

export function TopBarSkeleton() {
  return (
    <>
      <div className="sticky top-0 z-40 h-16 border-b border-line bg-ink/95 lg:hidden" />
      <div aria-hidden="true" className="hidden h-[106px] lg:block" />
    </>
  );
}
