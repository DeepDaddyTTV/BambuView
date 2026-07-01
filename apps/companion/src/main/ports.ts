import net from "node:net";

function canListen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (available: boolean) => {
      server.removeAllListeners();
      server.close(() => resolve(available));
    };

    server.once("error", () => resolve(false));
    server.once("listening", () => finish(true));
    server.listen(port, host);
  });
}

export async function findAvailablePort(
  host: string,
  startingPort: number,
  attempts = 20,
): Promise<number> {
  for (let offset = 1; offset <= attempts; offset += 1) {
    const candidate = startingPort + offset;
    if (await canListen(host, candidate)) {
      return candidate;
    }
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
        return;
      }

      server.close(() => reject(new Error("Could not allocate a free port.")));
    });
  });
}
