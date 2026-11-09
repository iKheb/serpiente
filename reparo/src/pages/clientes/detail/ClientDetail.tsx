import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArchiveRestore,
  ArrowLeft,
  Ban,
  CalendarClock,
  Camera,
  History,
  ImageDown,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Printer,
  SearchX,
  Trash2,
} from 'lucide-react';
import { navigate } from '@/app/router';
import {
  REPAIR_STATUS_LABEL,
  deleteClient,
  deviceFullName,
  formatFolio,
  restoreClient,
  useAudit,
  useClient,
  useSettings,
  type Client,
} from '@/data';
import {
  Avatar,
  Button,
  Card,
  DateTimeText,
  DropdownMenu,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
  StatusBadge,
  confirm,
  toast,
  useHotkey,
  usePrefersReducedMotion,
  type MenuItem,
} from '@/ui';
import { PhotoGallery } from '../components/PhotoGallery';
import { ReceiptSheet } from '../receipt/ReceiptSheet';
import { printReceipt } from '../receipt/receiptPrint';
import { buildReceiptModel } from '../receipt/receiptModel';
import { shareReceiptImage, useReceiptPieces } from '../receipt/actions';
import { StatusTrack, changeStatus } from './StatusTrack';
import { PaymentCard } from './PaymentCard';
import { ContactCard, DeviceCard, ExpensesCard, HistoryCard, NotesCard, PartsCard, ProfitCard, UnlockCard, WarrantyCard } from './cards';
import styles from './ClientDetail.module.css';

/** Ficha de un servicio/cliente: `#/clientes/<id>`. */
export function ClientDetail({ id }: { id: string }) {
  const client = useClient(id);
  if (client === undefined) return <DetailSkeleton />;
  if (client === null) return <Missing />;
  if (client.deletedAt != null) return <InTrash client={client} />;
  return <DetailView client={client} />;
}

export default ClientDetail;

/* --------------------------------- Vista ---------------------------------- */

function DetailView({ client }: { client: Client }) {
  const audit = useAudit({ entity: 'cliente', entityId: client.id });
  const settings = useSettings();
  const piezas = useReceiptPieces(client.id);
  const reduced = usePrefersReducedMotion();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const folio = formatFolio(client.folio);
  const device = deviceFullName(client);
  const tel = client.telefono.trim();
  const telHref = tel ? `tel:${tel.replace(/[^\d+]/g, '')}` : undefined;
  const edit = () => navigate(`#/clientes/${client.id}?editar=1`);
  useHotkey('e', (e) => {
    if (receiptOpen) return;
    e.preventDefault();
    edit();
  });

  const remove = async () => {
    const ok = await confirm({
      title: `¿Enviar ${folio} a la papelera?`,
      description: `${client.nombre || 'Este servicio'} dejará de contar en reportes. Podrás restaurarlo desde la papelera.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await deleteClient(client.id);
      toast({
        title: 'Servicio enviado a la papelera',
        description: `${folio} · ${client.nombre}`,
        action: { label: 'Deshacer', onClick: () => void restoreClient(client.id) },
      });
      navigate('#/clientes');
    } catch {
      toast({ title: 'No se pudo eliminar', tone: 'danger' });
    }
  };

  const share = async () => {
    if (!settings) return;
    setSharing(true);
    await shareReceiptImage(client, settings, piezas);
    setSharing(false);
  };
  const print = () => settings && printReceipt(buildReceiptModel(client, settings, piezas));

  const menu: MenuItem[] = [
    { label: 'Editar servicio', icon: <Pencil />, onSelect: edit },
    { label: 'Ver en Actividad', icon: <History />, href: `#/actividad?entidad=cliente&id=${client.id}` },
    { type: 'separator' },
    client.estado === 'cancelado'
      ? { label: 'Reactivar servicio', icon: <ArchiveRestore />, onSelect: () => void changeStatus(client, 'recibido') }
      : { label: 'Marcar como cancelado', icon: <Ban />, onSelect: () => void changeStatus(client, 'cancelado') },
    { label: 'Eliminar', icon: <Trash2 />, danger: true, onSelect: remove },
  ];

  const fade = (i: number) =>
    reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay: 0.04 * i, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Clientes', href: '#/clientes' }, { label: folio }]}
        leading={<Avatar name={client.nombre || '?'} size="lg" />}
        title={client.nombre || 'Cliente sin nombre'}
        meta={<StatusBadge status={client.estado} />}
        subtitle={
          <span className={styles.subtitle}>
            <span className={styles.folioTag}>{folio}</span>
            {device && <span>{device}</span>}
            {client.servicio && <span>{client.servicio}</span>}
            <span className={styles.subtitleTime}>
              <CalendarClock aria-hidden />
              Ingresó el <DateTimeText value={client.fecha} />
            </span>
          </span>
        }
        actions={
          <div className={styles.headerActions}>
            <Button variant="primary" iconLeft={<MessageCircle />} onClick={() => setReceiptOpen(true)} className={styles.ctaWa}>
              Enviar recibo por WhatsApp
            </Button>
            <div className={styles.iconRow}>
              <IconButton variant="secondary" icon={<ImageDown />} label="Compartir recibo (imagen)" onClick={share} loading={sharing} />
              <IconButton variant="secondary" icon={<Printer />} label="Imprimir recibo" onClick={print} />
              <IconButton
                variant="secondary"
                icon={<Phone />}
                label={tel ? `Llamar a ${tel}` : 'Sin teléfono'}
                disabled={!telHref}
                onClick={() => telHref && (location.href = telHref)}
              />
              <IconButton variant="secondary" icon={<Pencil />} label="Editar" onClick={edit} shortcut="E" />
              <DropdownMenu
                label="Más acciones"
                align="end"
                items={menu}
                trigger={<IconButton variant="secondary" icon={<MoreHorizontal />} label="Más acciones" />}
              />
            </div>
          </div>
        }
      />

      <motion.div {...fade(0)}>
        <StatusTrack client={client} audit={audit} />
      </motion.div>

      <div className={styles.grid}>
        <div className={styles.colMain}>
          <motion.div className={styles.oDevice} {...fade(1)}>
            <DeviceCard client={client} />
          </motion.div>
          <motion.div className={styles.oPhotos} {...fade(2)}>
            <Card as="section" className={styles.card} title="Evidencia fotográfica" icon={<Camera />} description="Estado del equipo al recibir, durante la reparación y al entregar">
              <PhotoGallery clientId={client.id} editable />
            </Card>
          </motion.div>
          <motion.div className={styles.oParts} {...fade(3)}>
            <PartsCard client={client} />
          </motion.div>
          <motion.div className={styles.oExpenses} {...fade(4)}>
            <ExpensesCard client={client} />
          </motion.div>
          <motion.div className={styles.oHistory} {...fade(5)}>
            <HistoryCard client={client} audit={audit} />
          </motion.div>
        </div>
        <aside className={styles.colSide} aria-label="Resumen del servicio">
          <motion.div className={styles.oPayment} {...fade(1)}>
            <PaymentCard client={client} />
          </motion.div>
          <motion.div className={styles.oProfit} {...fade(2)}>
            <ProfitCard client={client} />
          </motion.div>
          <motion.div className={styles.oContact} {...fade(3)}>
            <ContactCard client={client} />
          </motion.div>
          <motion.div className={styles.oUnlock} {...fade(4)}>
            <UnlockCard client={client} />
          </motion.div>
          <motion.div className={styles.oWarranty} {...fade(5)}>
            <WarrantyCard client={client} />
          </motion.div>
          <motion.div className={styles.oNotes} {...fade(6)}>
            <NotesCard client={client} />
          </motion.div>
          <p className={styles.metaFoot}>
            Creado <DateTimeText value={client.createdAt} /> · Última modificación <DateTimeText value={client.updatedAt} variant="relative-datetime" />
          </p>
        </aside>
      </div>

      <ReceiptSheet client={client} open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}

/* ------------------------------ Otros estados ----------------------------- */

function Missing() {
  return (
    <div className={styles.page}>
      <PageHeader breadcrumbs={[{ label: 'Clientes', href: '#/clientes' }, { label: 'No encontrado' }]} title="Servicio no encontrado" />
      <Card className={styles.stateCard}>
        <EmptyState
          icon={<SearchX />}
          tone="neutral"
          title="Este servicio no existe"
          description="Puede que se haya eliminado definitivamente o que el enlace esté incompleto."
          action={
            <Button variant="primary" iconLeft={<ArrowLeft />} onClick={() => navigate('#/clientes')}>
              Volver a clientes
            </Button>
          }
        />
      </Card>
    </div>
  );
}

function InTrash({ client }: { client: Client }) {
  const [busy, setBusy] = useState(false);
  const folio = formatFolio(client.folio);
  const restore = async () => {
    setBusy(true);
    try {
      await restoreClient(client.id);
      toast({ title: 'Servicio restaurado', description: `${folio} · ${client.nombre}`, tone: 'success' });
    } catch {
      toast({ title: 'No se pudo restaurar', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Clientes', href: '#/clientes' }, { label: folio }]}
        title={client.nombre || 'Cliente sin nombre'}
        meta={<StatusBadge status={client.estado} />}
        subtitle={`${deviceFullName(client)} · ${REPAIR_STATUS_LABEL[client.estado]}`}
      />
      <Card className={styles.stateCard}>
        <EmptyState
          icon={<Trash2 />}
          tone="expense"
          title="Este servicio está en la papelera"
          description={
            <>
              Se envió a la papelera el <DateTimeText value={client.deletedAt!} />. Restáuralo para verlo y editarlo de nuevo.
            </>
          }
          secondaryAction={
            <Button variant="ghost" onClick={() => navigate('#/clientes')}>
              Volver a clientes
            </Button>
          }
          action={
            <Button variant="primary" iconLeft={<ArchiveRestore />} onClick={restore} loading={busy}>
              Restaurar
            </Button>
          }
        />
      </Card>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Cargando servicio">
      <div className={styles.skHead}>
        <Skeleton width={140} height={12} />
        <div className={styles.skTitle}>
          <Skeleton circle height={44} />
          <div className={styles.skTitleText}>
            <Skeleton width={260} height={24} />
            <Skeleton width={340} height={12} />
          </div>
        </div>
      </div>
      <Skeleton height={76} radius={14} />
      <div className={styles.grid}>
        <div className={styles.colMain}>
          <Skeleton height={230} radius={14} />
          <Skeleton height={200} radius={14} />
          <Skeleton height={160} radius={14} />
        </div>
        <div className={styles.colSide}>
          <Skeleton height={250} radius={14} />
          <Skeleton height={190} radius={14} />
        </div>
      </div>
    </div>
  );
}
