import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { Camera, ChevronLeft, ChevronRight, Download, ImageOff, Images, Trash2, X } from 'lucide-react';
import {
  PHOTO_KIND_LABEL,
  ValidationError,
  addClientPhotos,
  deleteClientPhoto,
  downloadBlob,
  formatDateTime,
  useClientPhotos,
  usePhotoURL,
  type ClientPhoto,
  type PhotoKind,
} from '@/data';
import {
  Badge,
  Button,
  DateTimeText,
  EmptyState,
  IconButton,
  Portal,
  SegmentedControl,
  Skeleton,
  confirm,
  cx,
  toast,
  useFocusTrap,
  useLayer,
  usePrefersReducedMotion,
  useScrollLock,
} from '@/ui';
import styles from './Photos.module.css';

export interface PhotoGalleryProps {
  clientId: string;
  /** Permite agregar y eliminar fotos. */
  editable?: boolean;
}

const KINDS: PhotoKind[] = ['ingreso', 'reparacion', 'entrega'];
const KIND_TONE = { ingreso: 'info', reparacion: 'warning', entrega: 'success' } as const;
const KIND_SHORT: Record<PhotoKind, string> = { ingreso: 'Al recibir', reparacion: 'Reparación', entrega: 'Al entregar' };

function errorText(e: unknown): string {
  if (e instanceof ValidationError) return Object.values(e.fields)[0] ?? e.message;
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado';
}

function Tile({ photo, index, onOpen }: { photo: ClientPhoto; index: number; onOpen: () => void }) {
  const url = usePhotoURL(photo.thumb);
  return (
    <button type="button" className={cx(styles.tile, styles.tileButton)} onClick={onOpen} aria-label={`Ver foto ${index + 1}, ${PHOTO_KIND_LABEL[photo.kind]}, ${formatDateTime(photo.ts)}`}>
      {url ? <img src={url} alt="" className={styles.img} draggable={false} loading="lazy" /> : <Skeleton width="100%" height="100%" radius={0} />}
      <span className={styles.tileScrim} aria-hidden>
        <DateTimeText value={photo.ts} className={styles.tileTime} />
      </span>
    </button>
  );
}

/**
 * Galería de fotos de evidencia guardadas de un cliente: agrupadas por
 * momento, agregar más (cámara/galería), eliminar y visor a pantalla completa.
 */
export function PhotoGallery({ clientId, editable = false }: PhotoGalleryProps) {
  const photos = useClientPhotos(clientId);
  const [kind, setKind] = useState<PhotoKind>('ingreso');
  const [busy, setBusy] = useState(0);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const camRef = useRef<HTMLInputElement | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);

  const groups = useMemo(() => {
    if (!photos) return [];
    return KINDS.map((k) => ({ kind: k, items: photos.filter((p) => p.kind === k) })).filter((g) => g.items.length > 0);
  }, [photos]);
  // Orden del visor = orden visual (por grupo).
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  const upload = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => !f.type || f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(files.length);
    try {
      const added = await addClientPhotos(clientId, files, { kind });
      toast.success(added.length === 1 ? 'Foto agregada' : `${added.length} fotos agregadas`, { description: PHOTO_KIND_LABEL[kind] });
    } catch (e) {
      toast.error('No se pudieron guardar las fotos', { description: errorText(e) });
    } finally {
      setBusy(0);
    }
  };

  const remove = async (p: ClientPhoto) => {
    const ok = await confirm({
      title: '¿Eliminar esta foto?',
      description: `Foto ${PHOTO_KIND_LABEL[p.kind].toLowerCase()} del ${formatDateTime(p.ts)}. Esta acción no se puede deshacer.`,
      tone: 'danger',
      confirmLabel: 'Eliminar foto',
    });
    if (!ok) return false;
    try {
      await deleteClientPhoto(p.id);
      toast.success('Foto eliminada');
      return true;
    } catch (e) {
      toast.error('No se pudo eliminar la foto', { description: errorText(e) });
      return false;
    }
  };

  const total = photos?.length ?? 0;

  return (
    <div className={styles.gallery}>
      {editable && (
        <div className={styles.addBar}>
          <input ref={camRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
          <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
          <SegmentedControl<PhotoKind>
            size="sm"
            aria-label="Momento de la foto"
            value={kind}
            onChange={setKind}
            options={KINDS.map((k) => ({ value: k, label: KIND_SHORT[k] }))}
            className={styles.kindSeg}
          />
          <div className={styles.captureButtons}>
            <Button size="sm" variant="primary" iconLeft={<Camera />} loading={busy > 0} onClick={() => camRef.current?.click()}>
              Tomar foto
            </Button>
            <Button size="sm" variant="secondary" iconLeft={<Images />} disabled={busy > 0} onClick={() => galRef.current?.click()}>
              Galería
            </Button>
          </div>
        </div>
      )}

      {photos === undefined ? (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} width="100%" height="auto" radius={12} style={{ aspectRatio: '1 / 1' }} />
          ))}
        </div>
      ) : total === 0 && busy === 0 ? (
        editable ? (
          <div className={styles.dropEmpty}>
            <span className={styles.dropIcon} aria-hidden>
              <Camera />
            </span>
            <div className={styles.dropText}>
              <strong>Sin fotos de evidencia</strong>
              <span>Elige el momento y toma fotos del equipo para respaldar su estado.</span>
            </div>
          </div>
        ) : (
          <EmptyState size="sm" tone="neutral" icon={<ImageOff />} title="Sin fotos de evidencia" description="Este servicio no tiene fotos guardadas." />
        )
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <section key={g.kind} className={styles.group} aria-label={PHOTO_KIND_LABEL[g.kind]}>
              <header className={styles.groupHead}>
                <Badge size="sm" tone={KIND_TONE[g.kind]} dot>
                  {PHOTO_KIND_LABEL[g.kind]}
                </Badge>
                <span className={styles.groupCount}>{g.items.length === 1 ? '1 foto' : `${g.items.length} fotos`}</span>
              </header>
              <div className={styles.grid}>
                {g.items.map((p) => {
                  const idx = ordered.indexOf(p);
                  return <Tile key={p.id} photo={p} index={idx} onOpen={() => setOpenIdx(idx)} />;
                })}
                {busy > 0 && g.kind === kind && Array.from({ length: busy }, (_, i) => <Skeleton key={`b${i}`} width="100%" height="auto" radius={12} style={{ aspectRatio: '1 / 1' }} />)}
              </div>
            </section>
          ))}
          {busy > 0 && !groups.some((g) => g.kind === kind) && (
            <div className={styles.grid}>
              {Array.from({ length: busy }, (_, i) => (
                <Skeleton key={i} width="100%" height="auto" radius={12} style={{ aspectRatio: '1 / 1' }} />
              ))}
            </div>
          )}
        </div>
      )}

      <Lightbox
        photos={ordered}
        index={openIdx}
        onIndex={setOpenIdx}
        onClose={() => setOpenIdx(null)}
        onDelete={
          editable
            ? async (p) => {
                const ok = await remove(p);
                if (ok) {
                  const left = ordered.length - 1;
                  setOpenIdx((i) => (left <= 0 || i == null ? null : Math.min(i, left - 1)));
                }
              }
            : undefined
        }
      />
    </div>
  );
}

/* ------------------------------- Visor ---------------------------------- */

interface LightboxProps {
  photos: ClientPhoto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete?: (p: ClientPhoto) => void;
}

function Lightbox({ photos, index, onIndex, onClose, onDelete }: LightboxProps) {
  const open = index != null && photos[index] != null;
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [dir, setDir] = useState(0);
  useScrollLock(open);
  useFocusTrap(ref, open);
  useLayer(open, { onEscape: onClose });

  const go = (d: number) => {
    if (index == null || photos.length < 2) return;
    setDir(d);
    onIndex((index + d + photos.length) % photos.length);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const photo = open ? photos[index!] : null;

  return (
    <Portal>
      <AnimatePresence>
        {photo && (
          <motion.div
            ref={ref}
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Visor de fotos"
            tabIndex={-1}
            data-ui-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.lbTop}>
              <div className={styles.lbInfo}>
                <Badge tone={KIND_TONE[photo.kind]} dot>
                  {PHOTO_KIND_LABEL[photo.kind]}
                </Badge>
                <DateTimeText value={photo.ts} className={styles.lbTime} />
                <span className={styles.lbCount}>
                  {index! + 1} / {photos.length}
                </span>
              </div>
              <div className={styles.lbActions}>
                <IconButton
                  icon={<Download />}
                  label="Descargar"
                  className={styles.lbBtn}
                  onClick={() => downloadBlob(photo.blob, `evidencia-${new Date(photo.ts).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jpg`)}
                />
                {onDelete && <IconButton icon={<Trash2 />} label="Eliminar foto" className={styles.lbBtn} onClick={() => onDelete(photo)} />}
                <IconButton icon={<X />} label="Cerrar" className={styles.lbBtn} onClick={onClose} data-autofocus />
              </div>
            </div>

            <div className={styles.lbStage} onClick={(e) => e.target === e.currentTarget && onClose()}>
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                <LightboxImage key={photo.id} photo={photo} dir={dir} reduced={reduced} onSwipe={go} />
              </AnimatePresence>
              {photos.length > 1 && (
                <>
                  <button type="button" className={cx(styles.lbNav, styles.lbPrev)} onClick={() => go(-1)} aria-label="Foto anterior">
                    <ChevronLeft />
                  </button>
                  <button type="button" className={cx(styles.lbNav, styles.lbNext)} onClick={() => go(1)} aria-label="Foto siguiente">
                    <ChevronRight />
                  </button>
                </>
              )}
            </div>

            {photo.caption && <p className={styles.lbCaption}>{photo.caption}</p>}

            {photos.length > 1 && (
              <div className={styles.strip} role="list" aria-label="Miniaturas">
                {photos.map((p, i) => (
                  <StripThumb key={p.id} photo={p} active={i === index} onClick={() => (setDir(i > index! ? 1 : -1), onIndex(i))} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function LightboxImage({ photo, dir, reduced, onSwipe }: { photo: ClientPhoto; dir: number; reduced: boolean; onSwipe: (d: number) => void }) {
  const full = usePhotoURL(photo.blob);
  const thumb = usePhotoURL(photo.thumb);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -500) onSwipe(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) onSwipe(-1);
  };
  return (
    <motion.img
      src={full ?? thumb ?? undefined}
      alt={`${PHOTO_KIND_LABEL[photo.kind]} · ${formatDateTime(photo.ts)}`}
      className={styles.lbImg}
      draggable={false}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: dir * 60, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: dir * -60, scale: 0.98 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={onDragEnd}
    />
  );
}

function StripThumb({ photo, active, onClick, index }: { photo: ClientPhoto; active: boolean; onClick: () => void; index: number }) {
  const url = usePhotoURL(photo.thumb);
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);
  return (
    <button ref={ref} type="button" role="listitem" className={cx(styles.stripItem, active && styles.stripActive)} onClick={onClick} aria-label={`Foto ${index + 1}`} aria-current={active || undefined}>
      {url && <img src={url} alt="" draggable={false} />}
    </button>
  );
}
