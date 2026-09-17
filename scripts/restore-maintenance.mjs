import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Durable, fail-closed maintenance gate for the approved restore workflow.
// This records operator intent; it never performs a live restore or reopens writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, '.runtime', 'restore-maintenance.json');
const [command, backupId, actor = 'operator', reason = ''] = process.argv.slice(2);
if (!['start', 'fail', 'retry', 'succeed', 'status'].includes(command))
  throw Error('USAGE: status | start <backupId> <actor> <reason> | fail <backupId> <actor> <reason> | retry <backupId> <actor> <reason> | succeed <backupId <actor> <reason>');
let state = { mode: 'idle', writesBlocked: false, events: [] };
try { state = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
if (command === 'status') { console.log(JSON.stringify(state, null, 2)); process.exit(0); }
if (!backupId || !reason.trim()) throw Error('BACKUP_ID_AND_REASON_REQUIRED');
const now = new Date().toISOString();
if (command === 'start') {
  if (state.writesBlocked) throw Error('RESTORE_ALREADY_ACTIVE');
  state = { mode: 'running', backupId, writesBlocked: true, events: [...state.events, { at: now, action: 'start', actor, reason }] };
} else if (command === 'fail') {
  if (state.backupId !== backupId || !state.writesBlocked) throw Error('RESTORE_NOT_ACTIVE');
  state.mode = 'failed'; state.events.push({ at: now, action: 'fail', actor, reason });
} else if (command === 'retry') {
  if (state.backupId !== backupId || state.mode !== 'failed' || !state.writesBlocked) throw Error('RETRY_REQUIRES_FAILED_MAINTENANCE');
  state.mode = 'retrying'; state.events.push({ at: now, action: 'retry', actor, reason });
} else if (command === 'succeed') {
  if (state.backupId !== backupId || !['running', 'retrying'].includes(state.mode)) throw Error('RESTORE_NOT_RUNNING');
  state.mode = 'succeeded'; state.writesBlocked = false; state.events.push({ at: now, action: 'succeed', actor, reason });
}
await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(JSON.stringify(state, null, 2));
