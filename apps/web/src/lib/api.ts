export class ApiError extends Error {
  data: unknown;
  status: number;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.data = data;
    this.status = status;
  }
}

export async function apiFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Request failed.";

    throw new ApiError(response.status, message, data);
  }

  return data as T;
}
