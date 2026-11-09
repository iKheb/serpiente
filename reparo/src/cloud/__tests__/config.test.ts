import { describe, expect, it } from 'vitest';
import { decodeConnectionCode, encodeConnectionCode, normalizeAnonKey, normalizeProjectUrl, validateCloudConfig } from '../config';
import { toCloudError } from '../errors';

// Claves de ejemplo con el formato correcto (NO son claves reales).
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const FAKE_ANON = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'anon', ref: 'abcdefghijklmnopqrst' })}.firma_de_prueba`;
const FAKE_SERVICE = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role' })}.firma_de_prueba`;
const FAKE_PUBLISHABLE = 'sb_publishable_EJEMPLO_no_real_123';

describe('validación de la config', () => {
  it('normaliza la URL del proyecto', () => {
    expect(normalizeProjectUrl('https://abcdefghijklmnopqrst.supabase.co/')).toEqual({ ok: true, value: 'https://abcdefghijklmnopqrst.supabase.co' });
    expect(normalizeProjectUrl('abcdefghijklmnopqrst.supabase.co/rest/v1')).toEqual({ ok: true, value: 'https://abcdefghijklmnopqrst.supabase.co' });
    expect(normalizeProjectUrl('abcdefghijklmnopqrst')).toEqual({ ok: true, value: 'https://abcdefghijklmnopqrst.supabase.co' });
    expect(normalizeProjectUrl('http://abcdefghijklmnopqrst.supabase.co').ok).toBe(false);
    expect(normalizeProjectUrl('https://supabase.com/dashboard/project/x').ok).toBe(false);
    expect(normalizeProjectUrl('').ok).toBe(false);
    expect(normalizeProjectUrl('http://localhost:54321')).toEqual({ ok: true, value: 'http://localhost:54321' });
  });

  it('acepta claves publishable y anon; rechaza las secretas', () => {
    expect(normalizeAnonKey(FAKE_PUBLISHABLE).ok).toBe(true);
    expect(normalizeAnonKey(` ${FAKE_ANON}\n`)).toEqual({ ok: true, value: FAKE_ANON });
    const secret = normalizeAnonKey('sb_secret_EJEMPLO_123456789');
    expect(secret.ok).toBe(false);
    expect(!secret.ok && secret.error).toMatch(/SECRETA/);
    expect(normalizeAnonKey(FAKE_SERVICE).ok).toBe(false);
    expect(normalizeAnonKey('hola').ok).toBe(false);
  });

  it('el código de conexión va y vuelve (y tolera espacios)', () => {
    for (const anonKey of [FAKE_PUBLISHABLE, FAKE_ANON]) {
      const cfg = { url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey };
      const code = encodeConnectionCode(cfg);
      expect(code.startsWith('REPARO1.')).toBe(true);
      expect(decodeConnectionCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual({ ok: true, value: cfg });
    }
    const custom = { url: 'https://db.mitaller.com', anonKey: FAKE_PUBLISHABLE };
    expect(decodeConnectionCode(encodeConnectionCode(custom))).toEqual({ ok: true, value: custom });
    expect(decodeConnectionCode('REPARO1.basura!!').ok).toBe(false);
    expect(validateCloudConfig({ url: 'x', anonKey: 'y' }).value).toBeNull();
  });
});

describe('errores traducidos', () => {
  it('auth, red y esquema', () => {
    expect(toCloudError({ message: 'Invalid login credentials', code: 'invalid_credentials' }).message).toMatch(/Correo o contraseña incorrectos/);
    expect(toCloudError({ message: 'Email not confirmed' }).kind).toBe('confirm');
    expect(toCloudError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).kind).toBe('network');
    expect(toCloudError({ message: 'x', code: 'PGRST202' }).kind).toBe('schema');
    expect(toCloudError({ message: 'Invalid API key' }).kind).toBe('config');
    expect(toCloudError({ message: 'boom', status: 503 }).message).toMatch(/pausado/);
  });
});
