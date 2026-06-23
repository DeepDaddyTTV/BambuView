import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  type PropsWithChildren
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type AuthSession
} from "@bambuview/contracts";

import { apiFetch } from "../lib/api";

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  errorMessage: string | null;
  isSaving: boolean;
  updateAppearance: (next: AppearanceSettings) => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function applyAppearanceToDocument(appearance: AppearanceSettings) {
  document.documentElement.dataset.theme = appearance.mode;
  document.documentElement.dataset.backgroundStyle = appearance.backgroundStyle;
  document.documentElement.style.setProperty("--accent", appearance.darkHighlight);
  document.documentElement.style.setProperty("--accent-soft", `${appearance.darkHighlight}26`);
  document.documentElement.style.setProperty("--surface-bg", appearance.darkBackground);
  document.documentElement.style.setProperty("--light-accent", appearance.lightHighlight);
  document.documentElement.style.setProperty("--light-surface-bg", appearance.lightBackground);
}

export function appearanceStyleClass(backgroundStyle: AppearanceSettings["backgroundStyle"]) {
  return `app-background app-background--${backgroundStyle}`;
}

export function AppearanceProvider({
  children,
  initialAppearance
}: PropsWithChildren<{ initialAppearance?: AppearanceSettings | null }>) {
  const queryClient = useQueryClient();
  const [appearance, setAppearance] = useState(initialAppearance ?? DEFAULT_APPEARANCE);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setAppearance(initialAppearance ?? DEFAULT_APPEARANCE);
  }, [initialAppearance]);

  const applyEffect = useEffectEvent((nextAppearance: AppearanceSettings) => {
    applyAppearanceToDocument(nextAppearance);
  });

  useEffect(() => {
    applyEffect(appearance);
  }, [appearance, applyEffect]);

  async function updateAppearance(nextAppearance: AppearanceSettings) {
    const previous = appearance;
    setErrorMessage(null);
    setIsSaving(true);
    startTransition(() => {
      setAppearance(nextAppearance);
    });

    try {
      const response = await apiFetch<{ appearance: AppearanceSettings }>(
        "/api/settings/appearance",
        {
          method: "PUT",
          body: JSON.stringify(nextAppearance)
        }
      );

      startTransition(() => {
        setAppearance(response.appearance);
        queryClient.setQueryData<AuthSession | undefined>(["session"], (current) =>
          current
            ? {
                ...current,
                appearance: response.appearance
              }
            : current
        );
      });
    } catch (error) {
      startTransition(() => {
        setAppearance(previous);
      });
      setErrorMessage(error instanceof Error ? error.message : "Could not save appearance.");
      throw error;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppearanceContext.Provider
      value={{
        appearance,
        errorMessage,
        isSaving,
        updateAppearance
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within an AppearanceProvider.");
  }

  return context;
}
