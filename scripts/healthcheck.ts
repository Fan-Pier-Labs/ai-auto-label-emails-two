// health check script for Docker

export {};

try {
  const res = await fetch('http://localhost:3000/api/health');
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
