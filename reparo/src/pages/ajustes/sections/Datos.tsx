import { useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { Activity, ArchiveRestore, Boxes, CircleAlert, Download, FileJson, FlaskConical, GitMerge, Receipt, Replace, Trash2, TriangleAlert, Upload, Users, type LucideIcon } from 'lucide-react';
import {
  backupFilename,
  downloadBlob,
  exportBackup,
  exportCSV,
  importBackup,
  seedDemoData,
  wipeAllData,
  type CsvKind,
  type ImportResult,
  type Settings,
} from '@/data';
import { Badge, Button, DateTimeText, Dialog, Input, RadioCards, confirm, toast } from '@/ui';
import { Callout, Group, Row, formatBytes } from '../shared';
import styles from '../Ajustes.module.css';

const CSV: { kind: CsvKind; label: string; icon: LucideIcon }[] = [
  { kind: 'clientes', label: 'Clientes', icon: Users },
  { kind: 'gastos', label: 'Gastos', icon: Receipt },
  { kind: 'inventario', label: 'Inventario', icon: Boxes },
  { kind: 'movimientos', label: 'Movimientos', icon: ArchiveRestore },
  { kind: 'actividad', label: 'Actividad', icon: Activity },
];

const WEEK = 7 * 24 * 3600 * 1000;

function resultText(r: ImportResult): string {
  return `${r.clients} clientes · ${r.expenses} gastos · ${r.inventory} artículos · ${r.movements} movimientos · ${r.audit} registros de actividad`;
}

export function DatosSection({ settings }: { settings: Settings }) {
  const [exporting, setExporting] = useState(false);
  const [csvBusy, setCsvBusy] = useState<CsvKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ result: ImportResult; mode: 'merge' | 'replace' } | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stale = !settings.lastBackupAt || Date.now() - settings.lastBackupAt > WEEK;

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await exportBackup();
      downloadBlob(blob, backupFilename('json'));
      toast({ title: 'Respaldo descargado', description: `${backupFilename('json')} · ${formatBytes(blob.size)}`, tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo crear el respaldo', description: (e as Error).message, tone: 'danger' });
    } finally {
      setExporting(false);
    }
  };

  const doCsv = async (kind: CsvKind) => {
    setCsvBusy(kind);
    try {
      downloadBlob(await exportCSV(kind), backupFilename('csv', kind));
      toast({ title: `CSV de ${kind} descargado`, tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo exportar', description: (e as Error).message, tone: 'danger' });
    } finally {
      setCsvBusy(null);
    }
  };

  const doImport = async () => {
    if (!file) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: '¿Reemplazar todos los datos?',
        description: 'Se borrarán los clientes, gastos, inventario y actividad de este dispositivo y se cargará el contenido del respaldo. Esta acción no se puede deshacer.',
        confirmLabel: 'Reemplazar datos',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const result = await importBackup(file, mode);
      setFile(null);
      setSummary({ result, mode });
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const doSeed = async () => {
    const ok = await confirm({
      title: '¿Cargar datos de ejemplo?',
      description: 'Se reemplazan tus clientes, gastos e inventario por ~90 días de datos de un taller de ejemplo. Tus ajustes se conservan. Descarga un respaldo antes si tienes datos reales.',
      confirmLabel: 'Cargar ejemplo',
      tone: 'warning',
    });
    if (!ok) return;
    setSeeding(true);
    try {
      await seedDemoData();
      toast({ title: 'Datos de ejemplo cargados', description: 'Explora el Panel para ver el taller en acción.', tone: 'success', action: { label: 'Ir al Panel', onClick: () => navigate('#/panel') } });
    } finally {
      setSeeding(false);
    }
  };

  const doWipe = async () => {
    setWiping(true);
    try {
      await wipeAllData();
      setWipeOpen(false);
      toast({ title: 'Se borraron todos los datos', tone: 'success' });
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className={styles.stack}>
      <Group title="Copia de seguridad" description="Un archivo con todos tus datos y fotos. Guárdalo fuera de este dispositivo (correo, Drive, USB).">
        <Row
          title={
            <span className={styles.inlineTitle}>
              Último respaldo
              {stale ? (
                <Badge tone="warning" size="sm" dot>
                  {settings.lastBackupAt ? 'Hace más de una semana' : 'Nunca'}
                </Badge>
              ) : (
                <Badge tone="success" size="sm" dot>
                  Reciente
                </Badge>
              )}
            </span>
          }
          description={settings.lastBackupAt ? <DateTimeText value={settings.lastBackupAt} variant="relative-datetime" /> : 'Aún no has descargado ningún respaldo.'}
        >
          <Button variant="primary" iconLeft={<Download />} loading={exporting} onClick={doExport}>
            Descargar respaldo
          </Button>
        </Row>
        <Row title="Restaurar respaldo" description="Carga un archivo .json creado por Reparo en este u otro dispositivo.">
          <Button iconLeft={<Upload />} onClick={() => inputRef.current?.click()}>
            Elegir archivo…
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              if (f) {
                setFile(f);
                setMode('merge');
                setImportError(null);
              }
            }}
          />
        </Row>
      </Group>

      <Group title="Exportar a CSV" description="Para abrir en Excel o Google Sheets. Los datos de desbloqueo nunca se exportan.">
        <div className={styles.csvGrid}>
          {CSV.map(({ kind, label, icon: Icon }) => (
            <Button key={kind} variant="secondary" className={styles.csvBtn} iconLeft={<Icon />} loading={csvBusy === kind} disabled={!!csvBusy && csvBusy !== kind} onClick={() => doCsv(kind)}>
              {label}
            </Button>
          ))}
        </div>
      </Group>

      <Group title="Datos de ejemplo">
        <Row title="Cargar datos de ejemplo" description="Llena la app con un taller ficticio para explorar reportes, inventario y notificaciones.">
          <Button iconLeft={<FlaskConical />} loading={seeding} onClick={doSeed}>
            Cargar ejemplo
          </Button>
        </Row>
      </Group>

      <Group title="Zona de peligro" className={styles.danger}>
        <Row title="Borrar todos los datos" description="Elimina clientes, gastos, inventario, fotos y actividad de este dispositivo. No afecta al servidor de sincronización.">
          <Button variant="danger" iconLeft={<Trash2 />} onClick={() => setWipeOpen(true)}>
            Borrar todo
          </Button>
        </Row>
      </Group>

      {/* Restaurar */}
      <Dialog
        open={!!file}
        onClose={() => !importing && setFile(null)}
        title="Restaurar respaldo"
        icon={<FileJson />}
        description={file ? `${file.name} · ${formatBytes(file.size)}` : undefined}
        footer={
          <>
            <Button variant="ghost" disabled={importing} onClick={() => setFile(null)}>
              Cancelar
            </Button>
            <Button variant={mode === 'replace' ? 'danger' : 'primary'} loading={importing} onClick={doImport}>
              {mode === 'replace' ? 'Reemplazar datos' : 'Combinar datos'}
            </Button>
          </>
        }
      >
        <div className={styles.fields}>
          <RadioCards
            aria-label="Cómo restaurar"
            columns={1}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: 'Combinar', description: 'Agrega lo que falta y conserva la versión más reciente de cada registro.', icon: <GitMerge /> },
              { value: 'replace', label: 'Reemplazar', description: 'Borra lo de este dispositivo y deja exactamente lo del respaldo.', icon: <Replace /> },
            ]}
          />
          {importError && (
            <Callout tone="danger" icon={<CircleAlert />}>
              {importError}
            </Callout>
          )}
        </div>
      </Dialog>

      {/* Resultado */}
      <Dialog
        open={!!summary}
        onClose={() => setSummary(null)}
        tone="success"
        icon={<ArchiveRestore />}
        title="Respaldo restaurado"
        description={summary ? (summary.mode === 'replace' ? 'Los datos se reemplazaron con el respaldo.' : 'Los datos se combinaron con los de este dispositivo.') : undefined}
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setSummary(null)}>
            Listo
          </Button>
        }
      >
        {summary && (
          <dl className={styles.resultList}>
            {(
              [
                ['Clientes', summary.result.clients],
                ['Gastos', summary.result.expenses],
                ['Artículos de inventario', summary.result.inventory],
                ['Movimientos', summary.result.movements],
                ['Registros de actividad', summary.result.audit],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v.toLocaleString('es')}</dd>
              </div>
            ))}
          </dl>
        )}
        <span className={styles.srOnly}>{summary && resultText(summary.result)}</span>
      </Dialog>

      {/* Borrar todo */}
      <Dialog
        open={wipeOpen}
        onClose={() => {
          if (wiping) return;
          setWipeOpen(false);
          setWipeText('');
        }}
        role="alertdialog"
        tone="danger"
        size="sm"
        icon={<TriangleAlert />}
        title="¿Borrar todos los datos?"
        description="Se eliminará todo lo guardado en este dispositivo. Esta acción no se puede deshacer. Te recomendamos descargar un respaldo primero."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={wiping}
              onClick={() => {
                setWipeOpen(false);
                setWipeText('');
              }}
            >
              Cancelar
            </Button>
            <Button variant="danger" loading={wiping} disabled={wipeText.trim().toUpperCase() !== 'BORRAR'} onClick={doWipe}>
              Borrar definitivamente
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (wipeText.trim().toUpperCase() === 'BORRAR') void doWipe();
          }}
        >
          <Input
            label={
              <>
                Escribe <strong>BORRAR</strong> para confirmar
              </>
            }
            value={wipeText}
            onValueChange={setWipeText}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </Dialog>
    </div>
  );
}
