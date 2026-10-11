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
import { MEDIA_CONSENT_VERSION } from "@/lib/privacy/consent-texts";
import { deleteAccountAction, deleteAllSessionsAction } from "@/lib/privacy/settings-actions";

// Stránka závisí od URL a dát používateľa: navigácia smie počkať na server.
export const instant = false;

export const metadata: Metadata = { title: "Nastavenia" };

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
  const media = (kind: "microphone_processing" | "camera_analysis") =>
    consents[kind]?.granted === true && consents[kind]?.version === MEDIA_CONSENT_VERSION;

  return (
    <>
      <PageHeader title="Nastavenia" description={user.email ?? undefined} />
      {params.platba === "ok" ? (
        <Notice tone="success" className="mb-6">
          Platba prebehla. Pitche sa pripíšu do minúty, hneď ako ju potvrdí platobná brána.
        </Notice>
      ) : null}

      <Section id="profil" title="Profil a tréning">
        <SettingsForm
          initial={{
            displayName: profile?.display_name ?? "",
            defaultMode: settings?.default_mode ?? "coach",
            coachFocus: settings?.coach_focus ?? ["pace", "answer_length"],
            retention: settings?.data_retention_days ? String(settings.data_retention_days) : "forever",
          }}
        />
      </Section>

      <Section id="zariadenia" title="Mikrofón a kamera" description="Zariadenia vyberáš pred každým tréningom. Posledný výber si pamätá iba tento prehliadač.">
        <ForgetDevicesButton />
      </Section>

      <Section id="plan" title="Pitche" description={`Prvé ${FREE_PITCHES} pitche sú zadarmo. Ďalšie si dokúpiš v balíku, bez predplatného.`}>
        <p className="text-[15px] text-paper">{balanceLabel(balance)}</p>
        <div className="mt-6">
          {stripe ? <BuyPitchPackButton /> : <p className="text-[14.5px] text-mute">Platby zatiaľ nie sú zapnuté.</p>}
        </div>
      </Section>

      <Section id="sukromie" title="Súhlasy" description="Súhlas môžeš kedykoľvek odvolať. Bez súhlasu s mikrofónom ostáva textový režim.">
        <div className="divide-y divide-line/60">
          <ConsentToggle
            kind="microphone_processing"
            label="Hlasový rozhovor"
            description="Hlas sa posiela poskytovateľovi AI na prepis a odpovede investora. Nahrávka sa neukladá."
            granted={media("microphone_processing")}
          />
          <ConsentToggle
            kind="camera_analysis"
            label="Analýza kamery"
            description="Spracovanie prebieha v prehliadači. Ukladajú sa iba súhrnné pomery."
            granted={media("camera_analysis")}
          />
          <ConsentToggle
            kind="product_emails"
            label="E-maily o novinkách"
            description="Občas ti napíšeme o nových funkciách. Žiadne tretie strany."
            granted={consents.product_emails?.granted === true}
          />
        </div>
      </Section>

      <Section id="data" title="Tvoje údaje" description="Export obsahuje profil, projekty, prepisy, merania, reporty a cvičenia.">
        <div className="space-y-8">
          <div>
            <a href="/api/account/export" className={buttonClasses({ variant: "secondary" })}>
              Stiahnuť moje údaje (JSON)
            </a>
          </div>
          <div className="border-t border-line/60 pt-6">
            <p className="font-medium text-paper">Zmazať všetky tréningy</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-mute">Prepisy, merania a reporty. Projekty a podklady ostanú.</p>
            <div className="mt-3">
              <ConfirmAction
                trigger="Zmazať tréningy"
                title="Zmazať všetky tréningy?"
                description="Zmažú sa všetky prepisy, merania a reporty. Spotrebované minúty sa nevrátia."
                confirmLabel="Zmazať tréningy"
                pendingLabel="Mažem…"
                action={deleteAllSessionsAction}
              />
            </div>
          </div>
          <div className="border-t border-coral/30 pt-6">
            <p className="font-medium text-paper">Zmazať účet</p>
            <p className="mt-1 text-[14.5px] leading-relaxed text-mute">
              Natrvalo zmaže účet, projekty, nahrané podklady, tréningy aj cvičenia. Predplatné najprv zruš v správe predplatného.
            </p>
            <div className="mt-3">
              <ConfirmAction
                trigger="Zmazať účet"
                title="Zmazať účet natrvalo?"
                description="Zmažeme všetky tvoje údaje vrátane súborov. Toto sa nedá vrátiť."
                confirmLabel="Zmazať účet natrvalo"
                pendingLabel="Mažem…"
                action={deleteAccountAction}
              />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
