// health check script for Docker (uses PORT so it matches the running server)

export {};

const port = process.env.PORT || '8080';
try {
  const res = await fetch(`http://localhost:${port}/api/health`);
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
