import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { type AuthSession } from "@bambuview/contracts";

import { APP_VERSION } from "../app/version";
import { BrandLogo } from "../components/art";
import { ApiError, apiFetch } from "../lib/api";

function AuthField({
  icon,
  inputProps,
  label
}: {
  icon: React.ReactNode;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-300">{label}</span>
      <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="text-zinc-500">{icon}</span>
        <input
          {...inputProps}
          className="w-full bg-transparent text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </label>
  );
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token") ?? "";
  const inviteId =
    params.inviteId ??
    location.pathname.match(/\/auth\/invite\/([0-9a-fA-F-]+)/)?.[1] ??
    "";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState({
    email: "",
    name: "",
    password: ""
  });

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<AuthSession>("/api/auth/session")
  });

  const session = sessionQuery.data;
  if (session?.authenticated) {
    return <Navigate replace to="/fleet" />;
  }

  const isBootstrap = session?.bootstrapRequired ?? false;
  const isInvite = inviteId.length > 0 && inviteToken.length > 0;
  const heroDescription = isBootstrap
    ? "Create the first admin first. Printers, farms, and camera sources stay empty until you connect them from the live app."
    : "Watch every Bambu printer, camera, and farm from one graphite control room built for real operators.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload =
        isInvite
          ? await apiFetch<AuthSession>("/api/auth/register", {
              method: "POST",
              body: JSON.stringify({
                inviteId,
                inviteToken,
                name: formState.name,
                password: formState.password
              })
            })
          : isBootstrap
            ? await apiFetch<AuthSession>("/api/auth/bootstrap", {
                method: "POST",
                body: JSON.stringify({
                  email: formState.email,
                  name: formState.name,
                  password: formState.password
                })
              })
            : await apiFetch<AuthSession>("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({
                  email: formState.email,
                  password: formState.password
                })
              });

      queryClient.setQueryData(["session"], payload);
      navigate("/fleet");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-5">
      <div className="auth-layout mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1480px] overflow-hidden rounded-[36px] border border-white/8 bg-black/30 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative flex flex-col justify-between overflow-hidden px-6 py-7 lg:px-10 lg:py-10">
          <div className="auth-graphic__lines" />
          <div className="relative z-10 flex items-center gap-3">
            <BrandLogo className="h-11 w-[208px]" />
            <div>
              <div className="text-sm text-zinc-500">Fleet orchestration for print farms.</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-600">v{APP_VERSION}</div>
            </div>
          </div>
          <div className="relative z-10 mt-12 max-w-2xl lg:mt-0">
            <h1 className="text-5xl font-semibold leading-[0.94] text-white md:text-7xl">
              Print more.
              <br />
              Worry less.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-zinc-400">
              {heroDescription}
            </p>
            {isBootstrap ? null : (
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="auth-metric-card">
                  <div className="text-[0.98rem] uppercase tracking-[0.28em] text-zinc-500">
                    Printers Online
                  </div>
                  <div className="mt-5 text-[5.25rem] font-semibold leading-none text-white">7</div>
                  <div className="mt-2 text-sm text-zinc-400">4 Printing • 1 Farm</div>
                </div>
                <div className="auth-metric-card">
                  <div className="text-[0.98rem] uppercase tracking-[0.28em] text-zinc-500">
                    Camera Sources
                  </div>
                  <div className="mt-5 text-[5.25rem] font-semibold leading-none text-white">12</div>
                  <div className="mt-2 text-sm text-zinc-400">Frigate • RTSP • Bambu</div>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="flex items-center border-t border-white/8 px-6 py-7 lg:border-l lg:border-t-0 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-[540px]">
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
              {location.pathname.startsWith("/auth/invite")
                ? "Invite-only signup"
                : isBootstrap
                  ? "First-run bootstrap"
                  : "Local authentication"}
            </div>
            <h2 className="mt-4 text-4xl font-semibold text-white">
              {isInvite ? "Finish your invited account" : isBootstrap ? "Create the first admin" : "Sign in to BambuView"}
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              {isInvite
                ? "This invite creates a local account for the email your admin reserved."
                : isBootstrap
                  ? "Bootstrap is only available once. After this step, access becomes invite-only."
                  : "Use your local BambuView account to unlock fleet, camera, settings, and user management."}
            </p>
            <form
              className="mt-8 space-y-5"
              onSubmit={(event) => {
                void submit(event);
              }}
            >
              {isBootstrap || !isInvite ? (
                <AuthField
                  icon={<Mail className="h-4 w-4" />}
                  inputProps={{
                    autoComplete: "email",
                    onChange: (event) => setFormState((current) => ({ ...current, email: event.target.value })),
                    placeholder: "you@example.com",
                    required: true,
                    type: "email",
                    value: formState.email
                  }}
                  label="Email"
                />
              ) : null}
              {isBootstrap || isInvite ? (
                <AuthField
                  icon={<UserRound className="h-4 w-4" />}
                  inputProps={{
                    autoComplete: "name",
                    onChange: (event) => setFormState((current) => ({ ...current, name: event.target.value })),
                    placeholder: "Alex Morgan",
                    required: true,
                    value: formState.name
                  }}
                  label="Name"
                />
              ) : null}
              <AuthField
                icon={<LockKeyhole className="h-4 w-4" />}
                inputProps={{
                  autoComplete: isInvite || isBootstrap ? "new-password" : "current-password",
                  minLength: 8,
                  onChange: (event) => setFormState((current) => ({ ...current, password: event.target.value })),
                  placeholder: "••••••••",
                  required: true,
                  type: "password",
                  value: formState.password
                }}
                label="Password"
              />
              {errorMessage ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div> : null}
              <button
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[color:var(--accent)] px-6 py-4 text-base font-semibold text-zinc-950 transition hover:brightness-110"
                disabled={isSubmitting || sessionQuery.isLoading}
                type="submit"
              >
                {isSubmitting || sessionQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isInvite ? "Create account" : isBootstrap ? "Bootstrap BambuView" : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
