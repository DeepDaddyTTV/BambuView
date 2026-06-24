import type { ReactNode } from "react";

import { clsx } from "clsx";

import type { PrinterSummary } from "@bambuview/contracts";

import benchyPreview from "../assets/mockup/benchy.png";
import bracketPreview from "../assets/mockup/bracket.png";
import dinoPreview from "../assets/mockup/dino.png";
import housingPreview from "../assets/mockup/housing.png";
import logoMarkSvgRaw from "../../../../img/BambuView_Logo_Only.svg?raw";

function themeLogoSvg(svg: string) {
  return svg
    .replace(/<\?xml[^>]*>\s*/i, "")
    .replace(/fill:\s*#(?:000|000000|101317);/gi, "fill: var(--brand-logo-ink);")
    .replace(/fill:\s*#13bf00;/gi, "fill: var(--brand-logo-green);")
    .replace(/fill:\s*#(?:fff|ffffff);/gi, "fill: var(--brand-logo-ink);")
    .replace(/fill=\"#(?:000|000000|101317)\"/gi, 'fill="var(--brand-logo-ink)"')
    .replace(/fill=\"#13bf00\"/gi, 'fill="var(--brand-logo-green)"')
    .replace(/fill=\"#(?:fff|ffffff)\"/gi, 'fill="var(--brand-logo-ink)"')
    .replace(/<path d="M54\.03,[^>]+\/>/i, (match) =>
      match.replace("<path ", '<path fill="var(--brand-logo-ink)" ')
    )
    .trim();
}

const themedLogoMark = themeLogoSvg(logoMarkSvgRaw);

function InlineLogo({
  className,
  markup
}: {
  className?: string;
  markup: string;
}) {
  return (
    <span
      aria-label="BambuView"
      className={clsx("brand-logo", className)}
      dangerouslySetInnerHTML={{ __html: markup }}
      role="img"
    />
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      aria-label="BambuView"
      className={clsx("brand-lockup", className)}
      role="img"
    >
      <span
        aria-hidden="true"
        className="brand-lockup__mark"
        dangerouslySetInnerHTML={{ __html: themedLogoMark }}
      />
      <span
        aria-hidden="true"
        className="brand-lockup__wordmark"
      >
        <span className="brand-lockup__wordmark-main">Bambu</span>
        <span className="brand-lockup__wordmark-accent">View</span>
      </span>
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return <InlineLogo className={className} markup={themedLogoMark} />;
}

function resolvePreviewColor(primaryColor?: string) {
  return primaryColor ?? "var(--accent)";
}

const mockupPreviewByKind: Partial<Record<PrinterSummary["previewKind"], string>> = {
  benchy: benchyPreview,
  bracket: bracketPreview,
  dino: dinoPreview,
  housing: housingPreview
};

export function FarmPreviewArt({ className }: { className?: string }) {
  return (
    <ArtFrame className={clsx("flex items-center justify-center", className)}>
      <svg
        className="h-full w-full"
        fill="none"
        viewBox="0 0 240 180"
      >
        <rect
          width="240"
          height="180"
          fill="#14181d"
        />
        <g transform="translate(58 34)">
          <path d="m58 0 26 14v28L58 56 32 42V14L58 0Z" fill="#50565e" />
          <path d="m58 12 14 8v16L58 44 44 36V20l14-8Z" fill="#69727c" />
          <path d="M58 56 84 42v28L58 84 32 70V42l26 14Z" fill="#3a4047" />
          <path d="m32 28 26 14v28L32 84 6 70V42l26-14Z" fill="#555d66" />
          <path d="m84 28 26 14v28L84 84 58 70V42l26-14Z" fill="#5f6770" />
        </g>
      </svg>
    </ArtFrame>
  );
}

function ArtFrame({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,#1e232a,#16191e)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] before:bg-[size:28px_28px] before:opacity-35 before:content-['']",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PrinterPreviewArt({
  kind,
  className,
  primaryColor
}: {
  className?: string;
  kind: PrinterSummary["previewKind"];
  primaryColor?: string;
}) {
  const activeColor = resolvePreviewColor(primaryColor);
  const mockupPreview = mockupPreviewByKind[kind];

  if (mockupPreview) {
    return (
      <ArtFrame className={className}>
        <img
          alt=""
          className="mockup-preview-image"
          src={mockupPreview}
        />
      </ArtFrame>
    );
  }

  if (kind === "bracket") {
    return (
      <ArtFrame className={className}>
        <svg
          className="h-full w-full"
          fill="none"
          viewBox="0 0 240 180"
        >
          <rect
            x="0"
            y="0"
            width="240"
            height="180"
            fill="#15191d"
          />
          <path
            d="M58 133 42 114l12-56 28-9 38 18 46-13 31 19-22 56-28 11-17-19-31 10-15-18-26 10Z"
            fill={activeColor}
            opacity="0.95"
          />
          <path
            d="M82 62h31l7 17H75l7-17Zm59 14 31-9 14 8-10 25-36 11-9-35Z"
            fill="#a8eb63"
            opacity="0.65"
          />
        </svg>
      </ArtFrame>
    );
  }

  if (kind === "benchy") {
    return (
      <ArtFrame className={className}>
        <svg
          className="h-full w-full"
          fill="none"
          viewBox="0 0 240 180"
        >
          <rect
            width="240"
            height="180"
            fill="#161a1f"
          />
          <path
            d="M70 136c0-13 10-23 23-23h57c15 0 27 12 27 27H70v-4Z"
            fill="#9aa0aa"
          />
          <path
            d="M91 110 88 67h47V41h27l16 27v72H91v-30Z"
            fill="#cdd1d7"
          />
          <path
            d="M101 78h23v31h-23V78Z"
            fill="#6f7580"
          />
        </svg>
      </ArtFrame>
    );
  }

  if (kind === "dino") {
    return (
      <ArtFrame className={className}>
        <svg
          className="h-full w-full"
          fill="none"
          viewBox="0 0 240 180"
        >
          <rect
            width="240"
            height="180"
            fill="#14181d"
          />
          <path
            d="m90 145-16-15 6-30 19-15 18 6 12-28 26-8 20 12-7 18 16 21-7 21-22 5-22-12-16 25H90Z"
            fill={activeColor}
          />
          <circle
            cx="160"
            cy="72"
            r="5"
            fill="#101317"
          />
        </svg>
      </ArtFrame>
    );
  }

  if (kind === "housing") {
    return (
      <ArtFrame className={className}>
        <svg
          className="h-full w-full"
          fill="none"
          viewBox="0 0 240 180"
        >
          <rect
            width="240"
            height="180"
            fill="#14171c"
          />
          <circle
            cx="118"
            cy="92"
            r="54"
            fill="#8f949c"
          />
          <circle
            cx="118"
            cy="92"
            r="28"
            fill="#1f2329"
          />
          <circle
            cx="82"
            cy="55"
            r="10"
            fill="#b1b6bd"
          />
          <circle
            cx="156"
            cy="56"
            r="10"
            fill="#b1b6bd"
          />
          <circle
            cx="164"
            cy="126"
            r="10"
            fill="#b1b6bd"
          />
        </svg>
      </ArtFrame>
    );
  }

  return <FarmPreviewArt className={className} />;
}
