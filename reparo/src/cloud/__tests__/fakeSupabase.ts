/* Supabase falso en memoria: simula auth (correo/contraseña), la RPC
   `reparo_push` (LWW / append-only como supabase/schema.sql) y el select por
   seq con RLS (cada usuario sólo ve lo suyo). */
import type { CloudClient, CloudQuery, CloudSession } from '../client';

interface StoredRow {
  user_id: string;
  tbl: string;
  id: string;
  data: string; // JSON: simula jsonb (se reordenan claves al leer)
  updated_at: number;
  device_id: string | null;
  seq: number;
}

const LWW = new Set(['clients', 'expenses', 'inventory', 'settings']);
const APPEND = new Set(['movements', 'audit']);

/** Reordena claves al azar (jsonb no conserva el orden). */
function shuffleKeys(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(shuffleKeys);
  const entries = Object.entries(v as Record<string, unknown>).reverse();
  return Object.fromEntries(entries.map(([k, x]) => [k, shuffleKeys(x)]));
}

export class FakeSupabaseServer {
  rows = new Map<string, StoredRow>();
  seq = 0;
  users = new Map<string, { id: string; password: string }>();
  pushCalls = 0;
  selectCalls = 0;
  /** Si se define, la próxima llamada de red falla con este error. */
  failNext: { message: string; code?: string; status?: number } | null = null;

  rowsOf(userId: string): StoredRow[] {
    return [...this.rows.values()].filter((r) => r.user_id === userId).sort((a, b) => a.seq - b.seq);
  }

  push(userId: string, rows: unknown): number {
    this.pushCalls++;
    for (const raw of rows as Array<{ tbl: string; id: string; data: unknown; updated_at: number; device_id?: string | null }>) {
      const key = `${userId}|${raw.tbl}|${raw.id}`;
      const existing = this.rows.get(key);
      const next: StoredRow = {
        user_id: userId,
        tbl: raw.tbl,
        id: raw.id,
        data: JSON.stringify(raw.data),
        updated_at: Number(raw.updated_at),
        device_id: raw.device_id ?? null,
        seq: 0,
      };
      if (APPEND.has(raw.tbl)) {
        if (existing) continue;
      } else if (LWW.has(raw.tbl)) {
        if (existing && !(existing.updated_at <= next.updated_at)) continue;
      } else {
        throw new Error(`tbl desconocida: ${raw.tbl}`);
      }
      next.seq = ++this.seq;
      this.rows.set(key, next);
    }
    return Math.max(0, ...this.rowsOf(userId).map((r) => r.seq));
  }

  select(userId: string, gt: number, limit: number) {
    this.selectCalls++;
    return this.rowsOf(userId)
      .filter((r) => r.seq > gt)
      .slice(0, limit)
      .map((r) => ({ tbl: r.tbl, id: r.id, data: shuffleKeys(JSON.parse(r.data)), updated_at: String(r.updated_at), seq: String(r.seq) }));
  }

  takeFailure() {
    const f = this.failNext;
    this.failNext = null;
    return f;
  }
}

let nextUser = 1;

/** Cliente falso con la misma forma que el subconjunto de supabase-js que usa Reparo. */
export function fakeClient(server: FakeSupabaseServer): CloudClient & { session: CloudSession | null } {
  const listeners = new Set<(event: string, s: CloudSession | null) => void>();
  const emit = (event: string, s: CloudSession | null) => listeners.forEach((l) => l(event, s));
  const self = {
    session: null as CloudSession | null,
    auth: {
      getSession: async () => ({ data: { session: self.session }, error: null }),
      onAuthStateChange(cb: (event: string, s: CloudSession | null) => void) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const u = server.users.get(email);
        if (!u || u.password !== password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } };
        }
        self.session = { user: { id: u.id, email } };
        emit('SIGNED_IN', self.session);
        return { data: { user: self.session.user, session: self.session }, error: null };
      },
      async signUp({ email, password }: { email: string; password: string }) {
        if (server.users.has(email)) return { data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists', status: 422 } };
        const id = `00000000-0000-4000-8000-${String(nextUser++).padStart(12, '0')}`;
        server.users.set(email, { id, password });
        self.session = { user: { id, email } };
        emit('SIGNED_IN', self.session);
        return { data: { user: { ...self.session.user, identities: [{}] }, session: self.session }, error: null };
      },
      async signOut() {
        self.session = null;
        emit('SIGNED_OUT', null);
        return { error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      async updateUser({ password }: { password?: string }) {
        const s = self.session;
        if (!s) return { data: { user: null }, error: { message: 'Auth session missing!', code: 'session_not_found' } };
        const u = [...server.users.entries()].find(([, v]) => v.id === s.user.id);
        if (u && password) u[1].password = password;
        return { data: { user: s.user }, error: null };
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      const f = server.takeFailure();
      if (f) return { data: null, error: f };
      if (fn !== 'reparo_push') return { data: null, error: { message: 'Could not find the function', code: 'PGRST202' } };
      if (!self.session) return { data: null, error: { message: 'No has iniciado sesión', code: 'P0001' } };
      return { data: server.push(self.session.user.id, JSON.parse(JSON.stringify(args.rows))), error: null };
    },
    from(table: string) {
      return {
        select(_cols: string): CloudQuery {
          let gt = -Infinity;
          let limit = Infinity;
          const q: CloudQuery = {
            gt(_c: string, v: number) {
              gt = v;
              return q;
            },
            order() {
              return q;
            },
            limit(n: number) {
              limit = n;
              return q;
            },
            then(onfulfilled, onrejected) {
              const run = async () => {
                const f = server.takeFailure();
                if (f) return { data: null, error: f };
                if (table !== 'reparo_rows') return { data: null, error: { message: 'relation does not exist', code: '42P01' } };
                // RLS: sin sesión no se ve nada.
                if (!self.session) return { data: [], error: null };
                return { data: server.select(self.session.user.id, gt, limit), error: null };
              };
              return run().then(onfulfilled, onrejected);
            },
          };
          return q;
        },
      };
    },
  };
  return self as CloudClient & { session: CloudSession | null };
}
