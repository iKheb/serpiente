import { useId } from 'react';
import { MapPin, Phone, Store, User } from 'lucide-react';
import { formatDateTime, formatFolio, formatMoney, type Settings } from '@/data';
import { Input, Select, Textarea } from '@/ui';
import { COUNTRY_OPTIONS, countryFor, COUNTRIES, Group, rememberCountry, saveSettings, useTextSetting } from '../shared';
import styles from '../Ajustes.module.css';

export function NegocioSection({ settings }: { settings: Settings }) {
  const name = useTextSetting(settings, 'businessName');
  const owner = useTextSetting(settings, 'ownerName');
  const phone = useTextSetting(settings, 'businessPhone');
  const address = useTextSetting(settings, 'businessAddress');
  const footer = useTextSetting(settings, 'receiptFooter', 900);
  const country = countryFor(settings.phoneCountryCode);
  const id = useId();

  return (
    <div className={styles.split}>
      <div className={styles.stack}>
        <Group title="Identidad" description="Así aparece tu taller en la app y en los recibos.">
          <div className={styles.fields}>
            <Input
              id={`${id}-name`}
              label="Nombre del negocio"
              required
              prefix={<Store />}
              value={name.value}
              onValueChange={name.onChange}
              onBlur={name.onBlur}
              error={name.error}
              maxLength={120}
              autoComplete="organization"
            />
            <Input
              label="Tu nombre"
              optional
              prefix={<User />}
              value={owner.value}
              onValueChange={owner.onChange}
              onBlur={owner.onBlur}
              error={owner.error}
              maxLength={120}
              autoComplete="name"
              placeholder="Cómo te saluda Reparo"
            />
          </div>
        </Group>

        <Group title="Datos del recibo" description="Se imprimen en el encabezado y el pie del recibo que envías por WhatsApp.">
          <div className={styles.fields}>
            <div className={styles.fieldsRow}>
              <Input
                label="Teléfono del negocio"
                optional
                prefix={<Phone />}
                value={phone.value}
                onValueChange={phone.onChange}
                onBlur={phone.onBlur}
                error={phone.error}
                inputMode="tel"
                autoComplete="tel"
                maxLength={40}
                placeholder="55 1234 5678"
              />
              <Select
                label="Código de país (WhatsApp)"
                value={country?.iso ?? null}
                options={COUNTRY_OPTIONS}
                hint="Se antepone a los teléfonos de tus clientes."
                onChange={(iso) => {
                  const c = COUNTRIES.find((x) => x.iso === iso);
                  if (!c) return;
                  rememberCountry(iso);
                  void saveSettings({ phoneCountryCode: c.code });
                }}
              />
            </div>
            <Input
              label="Dirección"
              optional
              prefix={<MapPin />}
              value={address.value}
              onValueChange={address.onChange}
              onBlur={address.onBlur}
              error={address.error}
              maxLength={240}
              autoComplete="street-address"
              placeholder="Av. Juárez 123, Centro"
            />
            <Textarea
              label="Pie del recibo"
              hint="Garantía, horario o un agradecimiento."
              value={footer.value}
              onValueChange={footer.onChange}
              onBlur={footer.onBlur}
              error={footer.error}
              maxLength={600}
              showCount
              minRows={3}
            />
          </div>
        </Group>
      </div>

      <aside className={styles.previewCol} aria-label="Vista previa del recibo">
        <span className={styles.previewLabel}>Vista previa del recibo</span>
        <ReceiptPreview
          name={name.value}
          owner={owner.value}
          phone={phone.value}
          address={address.value}
          footer={footer.value}
          code={settings.phoneCountryCode}
        />
      </aside>
    </div>
  );
}

function ReceiptPreview({ name, owner, phone, address, footer, code }: { name: string; owner: string; phone: string; address: string; footer: string; code: string }) {
  const now = Date.now();
  return (
    <div className={styles.receipt}>
      <div className={styles.receiptHead}>
        <strong className={styles.receiptName}>{name.trim() || 'Nombre del negocio'}</strong>
        {owner.trim() && <span>Atiende: {owner.trim()}</span>}
        {phone.trim() && <span>Tel. +{code} {phone.trim()}</span>}
        {address.trim() && <span>{address.trim()}</span>}
      </div>
      <div className={styles.receiptRule} />
      <div className={styles.receiptLine}>
        <span>Folio</span>
        <span>{formatFolio(123)}</span>
      </div>
      <div className={styles.receiptLine}>
        <span>Fecha</span>
        <span>{formatDateTime(now)}</span>
      </div>
      <div className={styles.receiptLine}>
        <span>Equipo</span>
        <span>iPhone 13</span>
      </div>
      <div className={styles.receiptLine}>
        <span>Servicio</span>
        <span>Cambio de pantalla</span>
      </div>
      <div className={styles.receiptRule} />
      <div className={`${styles.receiptLine} ${styles.receiptTotal}`}>
        <span>Total</span>
        <span>{formatMoney(185000)}</span>
      </div>
      {footer.trim() && <p className={styles.receiptFoot}>{footer.trim()}</p>}
    </div>
  );
}
