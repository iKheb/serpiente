import { useEffect, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, ImagePlus, Images, X } from 'lucide-react';
import { Button, cx, usePrefersReducedMotion } from '@/ui';
import styles from './Photos.module.css';

export interface PhotoCaptureProps {
  /** Fotos pendientes (aún no guardadas). */
  files: File[];
  onChange: (f: File[]) => void;
}

function Thumb({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className={styles.tile}>
      {url && <img src={url} alt={`Foto pendiente ${index + 1}`} className={styles.img} draggable={false} />}
      <span className={styles.tileIndex}>{index + 1}</span>
      <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Quitar foto ${index + 1}`}>
        <X />
      </button>
    </div>
  );
}

const isImage = (f: File) => !f.type || f.type.startsWith('image/');

/**
 * Captura de fotos de evidencia ANTES de guardar el cliente: cámara trasera,
 * galería o arrastrar y soltar. Muestra miniaturas con botón para quitar.
 */
export function PhotoCapture({ files, onChange }: PhotoCaptureProps) {
  const camRef = useRef<HTMLInputElement | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const reduced = usePrefersReducedMotion();

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const imgs = Array.from(list).filter(isImage);
    if (imgs.length) onChange([...files, ...imgs]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  const count = files.length;

  return (
    <div
      className={cx(styles.capture, over && styles.over)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />

      {count === 0 ? (
        <div className={styles.dropEmpty}>
          <span className={styles.dropIcon} aria-hidden>
            <ImagePlus />
          </span>
          <div className={styles.dropText}>
            <strong>Fotografía el equipo al recibirlo</strong>
            <span>Pantalla, tapa, esquinas, golpes y rayones. Evita reclamos después.</span>
          </div>
        </div>
      ) : (
        <div className={styles.grid} role="list" aria-label="Fotos pendientes">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.div
                key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                role="listitem"
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Thumb file={f} index={i} onRemove={() => onChange(files.filter((_, k) => k !== i))} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className={styles.captureBar}>
        <div className={styles.captureButtons}>
          <Button variant="primary" size="md" iconLeft={<Camera />} onClick={() => camRef.current?.click()}>
            Tomar foto
          </Button>
          <Button variant="secondary" size="md" iconLeft={<Images />} onClick={() => galRef.current?.click()}>
            Elegir de galería
          </Button>
        </div>
        <span className={cx(styles.counter, count > 0 && styles.counterOn)} aria-live="polite">
          {count === 0 ? 'Sin fotos' : count === 1 ? '1 foto lista' : `${count} fotos listas`}
        </span>
      </div>
      <p className={styles.note}>Se comprimen automáticamente y se guardan sólo en este dispositivo, con fecha y hora.</p>
    </div>
  );
}
