import { Check, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  DARK_BACKGROUND_SWATCHES,
  HIGHLIGHT_SWATCHES,
  LIGHT_BACKGROUND_SWATCHES,
  type FleetOverview
} from "@bambuview/contracts";

import { useAppearance } from "../app/appearance";
import { LiveFleetPreview } from "../components/fleet-shared";
import { apiFetch } from "../lib/api";

const backgroundOptions = [
  { key: "topo", label: "Topo" },
  { key: "two-tone", label: "Two-Tone" },
  { key: "blueprint", label: "Blueprint" },
  { key: "sweep", label: "Sweep" },
  { key: "plain", label: "Plain" }
] as const;

function ColorSwatch({
  active,
  color,
  onClick
}: {
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`color-swatch ${active ? "color-swatch--active" : ""}`}
      onClick={onClick}
      style={{ backgroundColor: color }}
      type="button"
    >
      {active ? <Check className="h-4 w-4 text-black" /> : null}
    </button>
  );
}

export function SettingsPage() {
  const { appearance, errorMessage, isSaving, updateAppearance } = useAppearance();
  const previewQuery = useQuery({
    queryKey: ["fleet-overview"],
    queryFn: () => apiFetch<FleetOverview>("/api/fleet/overview")
  });

  async function save(next: typeof appearance) {
    await updateAppearance(next);
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.82fr_1.18fr]">
      <div className="space-y-6">
        <section className="panel">
          <div className="section-title">Colors</div>
          <div className="mt-6 space-y-8">
            <div>
              <div className="text-xl font-medium text-white">Dark Mode Colors</div>
              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                <div>
                  <div className="text-sm text-zinc-400">Highlight Color</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {HIGHLIGHT_SWATCHES.map((color) => (
                      <ColorSwatch
                        active={appearance.darkHighlight === color}
                        color={color}
                        key={color}
                        onClick={() => {
                          void save({
                            ...appearance,
                            darkHighlight: color
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400">Background Color</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {DARK_BACKGROUND_SWATCHES.map((color) => (
                      <ColorSwatch
                        active={appearance.darkBackground === color}
                        color={color}
                        key={color}
                        onClick={() => {
                          void save({
                            ...appearance,
                            darkBackground: color
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="text-xl font-medium text-white">Light Mode Colors</div>
              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                <div>
                  <div className="text-sm text-zinc-400">Highlight Color</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {HIGHLIGHT_SWATCHES.map((color) => (
                      <ColorSwatch
                        active={appearance.lightHighlight === color}
                        color={color}
                        key={color}
                        onClick={() => {
                          void save({
                            ...appearance,
                            lightHighlight: color
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400">Background Color</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {LIGHT_BACKGROUND_SWATCHES.map((color) => (
                      <ColorSwatch
                        active={appearance.lightBackground === color}
                        color={color}
                        key={color}
                        onClick={() => {
                          void save({
                            ...appearance,
                            lightBackground: color
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="section-title">Background Style</div>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Choose how the approved graphite shell picks up your selected highlight color.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {backgroundOptions.map((option) => (
              <button
                className={`background-card ${appearance.backgroundStyle === option.key ? "background-card--active" : ""}`}
                key={option.key}
                onClick={() => {
                  void save({
                    ...appearance,
                    backgroundStyle: option.key
                  });
                }}
                type="button"
              >
                <div className={`background-card__preview app-background app-background--${option.key}`} />
                <div className="mt-3 text-left text-base font-medium text-white">{option.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3 text-sm text-zinc-400">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-[color:var(--accent)]" />}
            {errorMessage ?? (isSaving ? "Saving appearance…" : "Appearance is synced to your local account.")}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">Live Fleet Preview</div>
        <p className="mt-3 text-sm leading-7 text-zinc-400">
          The preview reflects your actual appearance settings while keeping the approved fleet layout intact.
        </p>
        <div className="mt-5">
          {previewQuery.isLoading || !previewQuery.data ? (
            <div className="rounded-[28px] border border-white/8 bg-white/[0.03] px-6 py-8 text-zinc-400">
              Loading preview…
            </div>
          ) : (
            <LiveFleetPreview
              appearance={appearance}
              overview={previewQuery.data}
            />
          )}
        </div>
      </section>
    </div>
  );
}
