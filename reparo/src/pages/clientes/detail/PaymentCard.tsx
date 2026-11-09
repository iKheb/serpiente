import { useEffect, useState } from 'react';
import { BadgeCheck, Banknote, HandCoins, Wallet } from 'lucide-react';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  formatMoney,
  paymentStatus,
  saldoCents,
  updateClient,
  type Client,
  type PaymentMethod,
} from '@/data';
import { Badge, Button, Card, Dialog, MoneyInput, MoneyText, ProgressBar, SegmentedControl, toast } from '@/ui';
import styles from './ClientDetail.module.css';

const METHODS: PaymentMethod[] = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

async function applyPayment(client: Client, pagadoCents: number, metodoPago: PaymentMethod, title: string) {
  const prev = { pagadoCents: client.pagadoCents, metodoPago: client.metodoPago };
  try {
    await updateClient(client.id, { pagadoCents, metodoPago });
    toast({
      title,
      description: `${formatMoney(pagadoCents)} de ${formatMoney(client.cobroCents)} · ${PAYMENT_METHOD_LABEL[metodoPago]}`,
      tone: 'success',
      action: { label: 'Deshacer', onClick: () => void updateClient(client.id, prev) },
    });
    return true;
  } catch {
    toast({ title: 'No se pudo registrar el pago', tone: 'danger' });
    return false;
  }
}

export function PaymentCard({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const status = paymentStatus(client);
  const saldo = saldoCents(client);
  const tone = status === 'pagado' ? 'success' : status === 'parcial' ? 'pending' : 'warning';

  return (
    <Card
      as="section"
      className={styles.card}
      title="Pago"
      icon={<Wallet />}
      actions={
        <Badge tone={tone} dot size="sm">
          {PAYMENT_STATUS_LABEL[status]}
        </Badge>
      }
    >
      <div className={styles.payTotal}>
        <span className={styles.kicker}>Total del servicio</span>
        <MoneyText cents={client.cobroCents} size="xl" weight="semibold" className={styles.payBig} />
      </div>
      <ProgressBar
        value={client.pagadoCents}
        max={Math.max(1, client.cobroCents)}
        tone={status === 'pagado' ? 'income' : 'pending'}
        size="sm"
        aria-label="Porcentaje pagado"
      />
      <dl className={styles.payGrid}>
        <div>
          <dt>Abonado</dt>
          <dd>
            <MoneyText cents={client.pagadoCents} tone="income" />
          </dd>
        </div>
        <div>
          <dt>Saldo</dt>
          <dd>
            <MoneyText cents={saldo} tone={saldo > 0 ? 'pending' : 'muted'} weight={saldo > 0 ? 'semibold' : 'medium'} />
          </dd>
        </div>
        <div>
          <dt>Método</dt>
          <dd>{client.pagadoCents > 0 ? PAYMENT_METHOD_LABEL[client.metodoPago] : '—'}</dd>
        </div>
      </dl>
      {saldo > 0 ? (
        <div className={styles.payActions}>
          <Button
            variant="primary"
            iconLeft={<BadgeCheck />}
            onClick={() => applyPayment(client, client.cobroCents, client.metodoPago, 'Pago completo registrado')}
          >
            Registrar pago completo
          </Button>
          <Button iconLeft={<HandCoins />} onClick={() => setOpen(true)}>
            Registrar abono
          </Button>
        </div>
      ) : (
        client.cobroCents > 0 && (
          <p className={styles.paidNote}>
            <BadgeCheck aria-hidden /> Liquidado. No hay saldo pendiente.
          </p>
        )
      )}
      <AbonoDialog client={client} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function AbonoDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const saldo = saldoCents(client);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>(client.metodoPago);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(0);
      setMethod(client.metodoPago);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (amount <= 0) return setError('Escribe un monto mayor a cero.');
    if (amount > saldo) return setError(`El abono no puede superar el saldo (${formatMoney(saldo)}).`);
    setSaving(true);
    const ok = await applyPayment(
      client,
      client.pagadoCents + amount,
      method,
      amount === saldo ? 'Pago completo registrado' : `Abono de ${formatMoney(amount)} registrado`,
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      icon={<Banknote />}
      tone="success"
      title="Registrar abono"
      description={`Saldo pendiente: ${formatMoney(saldo)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="abono-form" loading={saving}>
            Guardar abono
          </Button>
        </>
      }
    >
      <form
        id="abono-form"
        className={styles.abonoForm}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <MoneyInput
          label="Monto del abono"
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setError(null);
          }}
          max={saldo}
          error={error ?? undefined}
          autoFocus
          size="lg"
          suffix={
            <button type="button" className={styles.fillBtn} onClick={() => setAmount(saldo)}>
              Todo
            </button>
          }
        />
        <div className={styles.methodField}>
          <span className={styles.kicker}>Método de pago</span>
          <SegmentedControl
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod)}
            options={METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
            aria-label="Método de pago"
            size="sm"
            fullWidth
          />
        </div>
        {amount > 0 && amount <= saldo && (
          <p className={styles.abonoPreview}>
            Quedará un saldo de <strong>{formatMoney(saldo - amount)}</strong>
          </p>
        )}
      </form>
    </Dialog>
  );
}
