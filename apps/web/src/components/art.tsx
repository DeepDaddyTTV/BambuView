import type { ReactNode } from "react";

import { clsx } from "clsx";

import type { PrinterSummary } from "@bambuview/contracts";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
    >
      <path
        d="M12 16L32 6l20 10v31L32 58 12 47V16Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <path
        d="M24 20h16v8H24zM24 32h10v8H24zM36 32h4v8h-4z"
        fill="currentColor"
      />
    </svg>
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
        "relative overflow-hidden rounded-[22px] border border-white/6 bg-[linear-gradient(180deg,#1e232a,#16191e)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PrinterPreviewArt({
  kind,
  className
}: {
  className?: string;
  kind: PrinterSummary["previewKind"];
}) {
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
            fill="var(--accent)"
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
            fill="var(--accent)"
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

  return (
    <ArtFrame className={clsx("flex items-center justify-center", className)}>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((cube) => (
          <div
            key={cube}
            className="h-10 w-10 rounded-xl border border-[color:var(--accent)]/60 bg-[color:var(--accent-soft)]"
          />
        ))}
      </div>
    </ArtFrame>
  );
}
