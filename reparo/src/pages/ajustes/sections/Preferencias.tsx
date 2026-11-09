import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { CURRENCIES, formatMoney, type Settings, type ThemePreference } from '@/data';
import { MoneyInput, SegmentedControl, Select, cx, useIsMobile } from '@/ui';
import { Group, Row, saveSettings } from '../shared';
import styles from '../Ajustes.module.css';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: c.label, meta: formatMoney(125050, { currency: c.code, locale: c.locale }) }));

const THEMES: { value: ThemePreference; label: string; desc: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Oscuro', desc: 'Ideal para el taller', icon: Moon },
  { value: 'light', label: 'Claro', desc: 'Más luz, más contraste', icon: Sun },
  { value: 'system', label: 'Sistema', desc: 'Sigue a tu dispositivo', icon: Monitor },
];

export function PreferenciasSection({ settings }: { settings: Settings }) {
  const cur = CURRENCIES.find((c) => c.code === settings.currency);
  const mobile = useIsMobile();
  return (
    <div className={styles.stack}>
      <Group title="Moneda y formato" description="Cambia cómo se muestran los montos en toda la app. Los importes guardados no se convierten.">
        <Row title="Moneda" description={`Ejemplo: ${formatMoney(125050, { currency: settings.currency, locale: cur?.locale ?? settings.locale })}`}>
          <Select
            aria-label="Moneda"
            width={mobile ? '100%' : 260}
            value={settings.currency}
            options={CURRENCY_OPTIONS}
            onChange={(code) => {
              const c = CURRENCIES.find((x) => x.code === code);
              void saveSettings({ currency: code, locale: c?.locale ?? settings.locale });
            }}
          />
        </Row>
        <Row title="Inicio de semana" description="Afecta los reportes semanales y el calendario.">
          <SegmentedControl
            aria-label="Inicio de semana"
            value={String(settings.weekStartsOn) as '0' | '1'}
            onChange={(v) => void saveSettings({ weekStartsOn: v === '0' ? 0 : 1 })}
            options={[
              { value: '1', label: 'Lunes' },
              { value: '0', label: 'Domingo' },
            ]}
          />
        </Row>
      </Group>

      <Group title="Apariencia" description="El tema se aplica al instante en este dispositivo.">
        <ThemePicker value={settings.theme} onChange={(theme) => void saveSettings({ theme })} />
      </Group>

      <Group title="Meta mensual de ganancia" description="Se muestra como progreso en el Panel y en Reportes. Déjala en 0 para no usar meta.">
        <GoalInput saved={settings.monthlyGoalCents} />
      </Group>
    </div>
  );
}

function ThemePicker({ value, onChange }: { value: ThemePreference; onChange: (v: ThemePreference) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = THEMES.findIndex((t) => t.value === value);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = (idx + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + THEMES.length) % THEMES.length;
    onChange(THEMES[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Tema" className={styles.themeGrid} onKeyDown={onKeyDown}>
      {THEMES.map((t, i) => {
        const on = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={cx(styles.themeCard, on && styles.themeOn)}
            onClick={() => onChange(t.value)}
          >
            <span className={cx(styles.themePreview, styles[`tp-${t.value}`])} aria-hidden>
              <span className={styles.tpHalf}>
                <span className={styles.tpSide} />
                <span className={styles.tpMain}>
                  <span className={styles.tpBar} />
                  <span className={styles.tpCards}>
                    <span />
                    <span />
                  </span>
                  <span className={styles.tpLine} />
                  <span className={styles.tpLine} style={{ width: '60%' }} />
                </span>
              </span>
            </span>
            <span className={styles.themeMeta}>
              <Icon aria-hidden />
              <span className={styles.themeText}>
                <span className={styles.themeLabel}>{t.label}</span>
                <span className={styles.themeDesc}>{t.desc}</span>
              </span>
              <span className={cx(styles.themeCheck, on && styles.themeCheckOn)} aria-hidden>
                {on && <Check />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GoalInput({ saved }: { saved: number }) {
  const [value, setValue] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editing = useRef(false);
  const latest = useRef(saved);
  useEffect(() => {
    if (!editing.current) {
      setValue(saved);
      latest.current = saved;
    }
  }, [saved]);
  const commit = (cents: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    editing.current = false;
    if (cents !== saved) void saveSettings({ monthlyGoalCents: cents });
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className={styles.goalRow}>
      <MoneyInput
        label="Meta de ganancia por mes"
        value={value}
        onChange={(cents) => {
          editing.current = true;
          latest.current = cents;
          setValue(cents);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(cents), 900);
        }}
        onBlur={() => commit(latest.current)}
        hint={value > 0 ? `≈ ${formatMoney(Math.round(value / 30))} de ganancia por día` : 'Sin meta definida'}
      />
    </div>
  );
}
