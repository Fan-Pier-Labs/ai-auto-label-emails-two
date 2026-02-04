#!/usr/bin/env bun
import { createServer } from "net";
import { spawn } from "child_process";

const startPort = parseInt(process.env.PORT || "8080", 10);

function findAvailablePort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        findAvailablePort(port + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      server.close(() => resolve(port));
    });
  });
}

async function main(): Promise<void> {
  const port = await findAvailablePort(startPort);
  if (port !== startPort) {
    console.log(`Port ${startPort} in use, using ${port} instead.`);
  }
  const child = spawn("bun", ["--bun", "next", "dev", "-p", String(port)], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
    shell: false,
  });
  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
