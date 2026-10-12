import type { Metadata } from "next";
import { ConsentToggle, ForgetDevicesButton, SettingsForm } from "@/components/settings/settings-forms";
import { BuyPitchPackButton } from "@/components/pitch/pitch-paywall";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { balanceLabel, FREE_PITCHES } from "@/lib/billing/pitch-pack";
import { getCurrentConsents, getProfile, getSettings } from "@/lib/db/profile";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { getLocale } from "@/lib/i18n/server";
import { MEDIA_CONSENT_VERSION } from "@/lib/privacy/consent-texts";
import { deleteAccountAction, deleteAllSessionsAction } from "@/lib/privacy/settings-actions";

// Stránka závisí od URL a dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Settings" : "Nastavenia" };
}

function Section({ id, title, children, description }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid gap-6 border-t border-line/70 py-10 md:grid-cols-12 md:gap-10">
      <div className="md:col-span-4">
        <h2 id={`${id}-title`} className="type-heading text-[1.3rem]">
          {title}
        </h2>
        {description ? <p className="mt-2 text-[14.5px] leading-relaxed text-faint">{description}</p> : null}
      </div>
      <div className="md:col-span-8">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/app/nastavenia">) {
  const user = await requireUser("/app/nastavenia");
  const params = await searchParams;
  const [profile, settings, consents, balance] = await Promise.all([
    getProfile(user.id),
    getSettings(user.id),
    getCurrentConsents(user.id),
    getPitchBalance(user.id),
  ]);
  const stripe = isStripeConfigured();
  const locale = await getLocale();
  const en = locale === "en";
  const L = (sk: string, enText: string) => (en ? enText : sk);
  const media = (kind: "microphone_processing" | "camera_analysis") =>
    consents[kind]?.granted === true && consents[kind]?.version === MEDIA_CONSENT_VERSION;

  return (
    <>
      <PageHeader title={L("Nastavenia", "Settings")} description={user.email ?? undefined} />
      {params.platba === "ok" ? (
        <Notice tone="success" className="mb-6">
          {L("Platba prebehla. Pitche sa pripíšu do minúty, hneď ako ju potvrdí platobná brána.", "Payment complete. Your pitches are added within a minute, as soon as the payment provider confirms it.")}
        </Notice>
      ) : null}

      <Section id="profil" title={L("Profil a tréning", "Profile and training")}>
        <SettingsForm
          initial={{
            displayName: profile?.display_name ?? "",
            defaultMode: settings?.default_mode ?? "coach",
            coachFocus: settings?.coach_focus ?? ["pace", "answer_length"],
            retention: settings?.data_retention_days ? String(settings.data_retention_days) : "forever",
          }}
        />
      </Section>

      <Section
        id="zariadenia"
        title={L("Mikrofón a kamera", "Microphone and camera")}
        description={L(
          "Zariadenia vyberáš pred každým tréningom. Posledný výber si pamätá iba tento prehliadač.",
          "You choose devices before every session. Only this browser remembers your last choice.",
        )}
      >
        <ForgetDevicesButton />
      </Section>

      <Section
        id="plan"
        title={L("Pitche", "Pitches")}
        description={L(`Prvé ${FREE_PITCHES} pitche sú zadarmo. Ďalšie si dokúpiš v balíku, bez predplatného.`, `Your first ${FREE_PITCHES} pitches are free. Buy more in a pack, no subscription.`)}
      >
        <p className="text-[15px] text-paper">{balanceLabel(balance, locale)}</p>
        <div className="mt-6">
          {stripe ? <BuyPitchPackButton /> : <p className="text-[14.5px] text-mute">{L("Platby zatiaľ nie sú zapnuté.", "Payments are not enabled yet.")}</p>}
        </div>
      </Section>

      <Section
        id="sukromie"
        title={L("Súhlasy", "Consents")}
        description={L("Súhlas môžeš kedykoľvek odvolať. Bez súhlasu s mikrofónom ostáva textový režim.", "You can withdraw consent at any time. Without microphone consent, text mode remains.")}
      >
        <div className="divide-y divide-line/60">
          <ConsentToggle
            kind="microphone_processing"
            label={L("Hlasový rozhovor", "Voice conversation")}
            description={L("Hlas sa posiela poskytovateľovi AI na prepis a odpovede investora. Nahrávka sa neukladá.", "Your voice is sent to the AI provider for transcription and investor replies. The recording is not stored.")}
            granted={media("microphone_processing")}
          />
          <ConsentToggle
            kind="camera_analysis"
            label={L("Analýza kamery", "Camera analysis")}
            description={L("Spracovanie prebieha v prehliadači. Ukladajú sa iba súhrnné pomery.", "Processing happens in the browser. Only summary ratios are stored.")}
            granted={media("camera_analysis")}
          />
          <ConsentToggle
            kind="product_emails"
            label={L("E-maily o novinkách", "Product news e-mails")}
            description={L("Občas ti napíšeme o nových funkciách. Žiadne tretie strany.", "Now and then we write about new features. No third parties.")}
            granted={consents.product_emails?.granted === true}
          />
        </div>
      </Section>

      <Section
        id="data"
        title={L("Tvoje údaje", "Your data")}
        description={L("Export obsahuje profil, projekty, prepisy, merania, reporty a cvičenia.", "The export contains your profile, projects, transcripts, measurements, reports and exercises.")}
      >
        <div className="space-y-8">
          <div>
            <a href="/api/account/export" className={buttonClasses({ variant: "secondary" })}>
              {L("Stiahnuť moje údaje (JSON)", "Download my data (JSON)")}
            </a>
          </div>
          <div className="border-t border-line/60 pt-6">
            <p className="font-medium text-paper">{L("Zmazať všetky tréningy", "Delete all sessions")}</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-mute">{L("Prepisy, merania a reporty. Projekty a podklady ostanú.", "Transcripts, measurements and reports. Projects and materials stay.")}</p>
            <div className="mt-3">
              <ConfirmAction
                trigger={L("Zmazať tréningy", "Delete sessions")}
                title={L("Zmazať všetky tréningy?", "Delete all sessions?")}
                description={L("Zmažú sa všetky prepisy, merania a reporty. Spotrebované minúty sa nevrátia.", "All transcripts, measurements and reports will be deleted. Used minutes are not refunded.")}
                confirmLabel={L("Zmazať tréningy", "Delete sessions")}
                pendingLabel={L("Mažem…", "Deleting…")}
                action={deleteAllSessionsAction}
              />
            </div>
          </div>
          <div className="border-t border-coral/30 pt-6">
            <p className="font-medium text-paper">{L("Zmazať účet", "Delete account")}</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-mute">
              {L(
                "Natrvalo zmaže účet, projekty, nahrané podklady, tréningy aj cvičenia. Predplatné najprv zruš v správe predplatného.",
                "Permanently deletes your account, projects, uploaded materials, sessions and exercises.",
              )}
            </p>
            <div className="mt-3">
              <ConfirmAction
                trigger={L("Zmazať účet", "Delete account")}
                title={L("Zmazať účet natrvalo?", "Delete your account permanently?")}
                description={L("Zmažeme všetky tvoje údaje vrátane súborov. Toto sa nedá vrátiť.", "We delete all your data including files. This cannot be undone.")}
                confirmLabel={L("Zmazať účet natrvalo", "Delete account permanently")}
                pendingLabel={L("Mažem…", "Deleting…")}
                action={deleteAccountAction}
              />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
