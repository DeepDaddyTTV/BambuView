import { Copy, Loader2, ShieldPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { InviteRecord, UserProfile, UserRole } from "@bambuview/contracts";

import { ApiError, apiFetch } from "../lib/api";

interface UsersPayload {
  currentUserId: string;
  users: UserProfile[];
}

export function UsersPage({ currentUser }: { currentUser: UserProfile }) {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [latestInvite, setLatestInvite] = useState<{
    invite: InviteRecord;
    inviteToken: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const usersQuery = useQuery({
    enabled: currentUser.role === "admin",
    queryKey: ["users"],
    queryFn: () => apiFetch<UsersPayload>("/api/users"),
  });
  const invitesQuery = useQuery({
    enabled: currentUser.role === "admin",
    queryKey: ["invites"],
    queryFn: () => apiFetch<{ invites: InviteRecord[] }>("/api/users/invites"),
  });

  const createInvite = useMutation({
    mutationFn: (payload: { email: string; role: UserRole }) =>
      apiFetch<{ invite: InviteRecord; inviteToken: string }>(
        "/api/users/invites",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: (payload) => {
      setLatestInvite(payload);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Could not create invite.",
      );
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ role, userId }: { role: UserRole; userId: string }) =>
      apiFetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    await createInvite.mutateAsync({
      email: inviteEmail,
      role: inviteRole,
    });
  }

  if (currentUser.role !== "admin") {
    return (
      <div className="panel">
        <div className="flex items-center gap-3 text-[color:var(--accent)]">
          <ShieldPlus className="h-5 w-5" />
          <span className="font-medium">Admin access required</span>
        </div>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
          Invite creation and role management are real in `0.0.22`, but they
          stay locked behind the local admin model you approved for first-run
          bootstrap.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="panel">
          <div className="section-title">Create invite</div>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Invites reserve a role and email for a local account. Copy the
            generated tokenized URL immediately after creation.
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              void submitInvite(event);
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-400">
                Invite email
              </span>
              <input
                className="input-field"
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="operator@example.com"
                required
                type="email"
                value={inviteEmail}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-zinc-400">Role</span>
              <select
                className="input-field"
                onChange={(event) =>
                  setInviteRole(event.target.value as UserRole)
                }
                value={inviteRole}
              >
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {errorMessage ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}
            <button
              className="rounded-full bg-[color:var(--accent)] px-5 py-3 font-medium text-zinc-950"
              disabled={createInvite.isPending}
              type="submit"
            >
              {createInvite.isPending ? "Creating invite…" : "Create invite"}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="section-title">Latest invite payload</div>
          {latestInvite ? (
            <div className="mt-5 space-y-4 text-sm text-zinc-300">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
                <div className="text-zinc-500">Invite URL</div>
                <div className="mt-2 break-all text-zinc-100">
                  {`${latestInvite.invite.inviteUrl}?token=${latestInvite.inviteToken}`}
                </div>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${latestInvite.invite.inviteUrl}?token=${latestInvite.inviteToken}`,
                  )
                }
                type="button"
              >
                <Copy className="h-4 w-4" />
                Copy invite link
              </button>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-zinc-400">
              Create an invite to surface the tokenized registration URL you can
              hand to a user.
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-title">Users</div>
        {usersQuery.isLoading ? (
          <div className="mt-5 flex items-center gap-2 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users…
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                <tr>
                  <th className="pb-4">Name</th>
                  <th className="pb-4">Email</th>
                  <th className="pb-4">Role</th>
                  <th className="pb-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {usersQuery.data?.users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-4 font-medium text-white">{user.name}</td>
                    <td className="py-4 text-zinc-400">{user.email}</td>
                    <td className="py-4">
                      <select
                        className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white"
                        disabled={
                          updateRole.isPending ||
                          usersQuery.data?.currentUserId === user.id
                        }
                        onChange={(event) =>
                          updateRole.mutate({
                            role: event.target.value as UserRole,
                            userId: user.id,
                          })
                        }
                        value={user.role}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-4 capitalize text-zinc-300">
                      {user.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-title">Invites</div>
        {invitesQuery.isLoading ? (
          <div className="mt-5 text-zinc-400">Loading invites…</div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                <tr>
                  <th className="pb-4">Email</th>
                  <th className="pb-4">Role</th>
                  <th className="pb-4">Expires</th>
                  <th className="pb-4">Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {invitesQuery.data?.invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="py-4 text-zinc-100">{invite.email}</td>
                    <td className="py-4 capitalize text-zinc-300">
                      {invite.role}
                    </td>
                    <td className="py-4 text-zinc-400">
                      {new Date(invite.expiresAt).toLocaleString()}
                    </td>
                    <td className="py-4 text-zinc-400">
                      {invite.usedAt ? "Used" : "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
