/* Selector de cliente/servicio para vincular el uso de una pieza. */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar, Combobox, Field, IconButton, StatusBadge, type ComboboxOption } from '@/ui';
import { deviceFullName, formatFolio, useClients, type Client, type ID } from '@/data';
import { clientOptionLabel } from './lib';
import styles from './inventario.module.css';

export interface ClientPickerProps {
  value: ID | null;
  onChange: (id: ID | null, client: Client | null) => void;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
}

/** Chip con folio y nombre si hay cliente; si no, Combobox para elegirlo. */
export function ClientPicker({ value, onChange, label = 'Cliente / servicio', hint, autoFocus }: ClientPickerProps) {
  const clients = useClients();
  const [text, setText] = useState('');
  const selected = useMemo(() => (value ? (clients?.find((c) => c.id === value) ?? null) : null), [clients, value]);

  const options = useMemo<ComboboxOption[]>(
    () =>
      (clients ?? [])
        .filter((c) => c.estado !== 'cancelado')
        .map((c) => ({
          id: c.id,
          value: clientOptionLabel(c),
          description: [deviceFullName(c), c.servicio].filter(Boolean).join(' · '),
          keywords: `${c.telefono} ${c.imei} ${c.folio}`,
          meta: <StatusBadge status={c.estado} short size="sm" />,
        })),
    [clients],
  );

  if (value && selected) {
    return (
      <Field label={label} labelAs="span" hint={hint}>
        <div className={styles.clientChip}>
          <Avatar name={selected.nombre || '?'} size="sm" />
          <span className={styles.clientChipText}>
            <span className={styles.clientChipTitle}>
              <span className={styles.folio}>{formatFolio(selected.folio)}</span> {selected.nombre || 'Sin nombre'}
            </span>
            <span className={styles.clientChipSub}>{[deviceFullName(selected), selected.servicio].filter(Boolean).join(' · ') || 'Sin equipo'}</span>
          </span>
          <IconButton icon={<X />} label="Quitar cliente" size="sm" onClick={() => onChange(null, null)} />
        </div>
      </Field>
    );
  }

  return (
    <Combobox
      label={label}
      optional
      hint={hint ?? 'Para saber en qué reparación se usó la pieza.'}
      placeholder={clients ? 'Buscar por nombre, folio o teléfono…' : 'Cargando clientes…'}
      value={text}
      onChange={setText}
      options={options}
      emptyText="Sin coincidencias"
      autoFocus={autoFocus}
      onSelect={(o) => {
        const c = clients?.find((x) => x.id === o.id) ?? null;
        if (c) {
          onChange(c.id, c);
          setText('');
        }
      }}
    />
  );
}
