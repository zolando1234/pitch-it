/* eslint-disable @next/next/no-img-element -- logo z public, veľkosť určuje CSS */
import { existsSync } from "node:fs";
import path from "node:path";
import { T } from "@/components/i18n/t";

/*
  Odznak „Winner of Techstars Startup Weekend“. Ak je v public/landing súbor
  techstars-winner.(svg|png|webp|jpg), zobrazí sa ako logo, inak ikona pohára a text.
  Súbor sa hľadá pri zostavení stránky, po jeho pridaní preto stačí nové nasadenie.
*/

const LOGO_FILES = ["techstars-winner.svg", "techstars-winner.png", "techstars-winner.webp", "techstars-winner.jpg"];

function findLogo(): string | null {
  const dir = path.join(process.cwd(), "public", "landing");
  const file = LOGO_FILES.find((name) => existsSync(path.join(dir, name)));
  return file ? `/landing/${file}` : null;
}

export function WinnerBadge() {
  const logo = findLogo();
  const pill = {
    marginTop: "30px",
    display: "inline-flex",
    alignItems: "center",
    gap: "14px",
    borderRadius: "999px",
    background: "rgba(22,22,26,.55)",
    border: "1px solid rgba(255,255,255,.16)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  } as const;
  const label = { fontSize: "11px", fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#AAFF00" } as const;

  // originálne logo (tmavé na priehľadnom pozadí) ostáva nezmenené na bielom podklade
  if (logo) {
    return (
      <div className="fu d4" style={{ ...pill, padding: "7px 8px 7px 20px" }}>
        <span style={label}>
          <T sk="Víťaz" en="Winner" />
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", background: "#FFFFFF", borderRadius: "999px", padding: "9px 20px" }}>
          <img src={logo} alt="Techstars Startup Weekend" style={{ display: "block", height: "28px", width: "auto" }} />
        </span>
      </div>
    );
  }
  return (
    <div className="fu d4" style={{ ...pill, padding: "10px 20px 10px 14px" }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#AAFF00" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 3.8 4 4M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 3.8-4 4" />
        <path d="M12 13v4M9 20h6M10 17h4" />
      </svg>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={label}>
          <T sk="Víťaz" en="Winner" />
        </span>
        <span style={{ fontSize: "15px", fontWeight: 700, color: "#F5F5F7" }}>Techstars Startup Weekend</span>
      </span>
    </div>
  );
}
