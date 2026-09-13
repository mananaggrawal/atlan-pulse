import { resolve } from 'node:path';
import { createApp } from './http.ts';
import { AuditService } from './service.ts';
import { FileRunStore } from '../store/runs.ts';
import { AccountStore } from '../store/accounts.ts';

const port = Number(process.env.PORT ?? 3001);
const baseUrl = process.env.PULSE_BASE_URL ?? `http://localhost:${port}`;
const dataDir = resolve(process.env.PULSE_DATA_DIR ?? '.data/runs');

const store = new FileRunStore(dataDir);
await store.load();

const accounts = new AccountStore(dataDir);
await accounts.load();

const app = createApp(new AuditService(store, baseUrl), store, accounts, {
  baseUrl,
  allowAnonymous: process.env.PULSE_ALLOW_ANONYMOUS === '1',
});
app.listen(port, () => {
  console.log(`Atlan Pulse on ${baseUrl}  ·  MCP at ${baseUrl}/api/mcp  ·  runs in ${dataDir}`);
});
