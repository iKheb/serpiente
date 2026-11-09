import { useMemo, useState } from 'react';
import { Download, History, Trash2 } from 'lucide-react';
import { setQuery, useRoute } from '@/app/router';
import { backupFilename, downloadBlob, exportCSV, useAudit, useTrash } from '@/data';
import { Button, PageHeader, Tabs, tabPanelProps, toast } from '@/ui';
import { ActivityLog } from './ActivityLog';
import { TrashView } from './TrashView';
import styles from './Actividad.module.css';

type Tab = 'registro' | 'papelera';
const PREFIX = 'actividad';

/** Registro de auditoría (todo lo que se agrega, modifica o elimina) y papelera. */
export default function ActividadPage() {
  const route = useRoute();
  const tab: Tab = route.query.get('tab') === 'papelera' ? 'papelera' : 'registro';
  const entries = useAudit();
  const trash = useTrash();
  const [exporting, setExporting] = useState(false);

  const trashIds = useMemo(() => {
    const s = new Set<string>();
    if (trash) for (const r of [...trash.clients, ...trash.expenses, ...trash.inventory]) s.add(r.id);
    return s;
  }, [trash]);

  const setTab = (t: Tab) => setQuery({ tab: t === 'papelera' ? 'papelera' : null });

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await exportCSV('actividad');
      downloadBlob(blob, backupFilename('csv', 'actividad'));
      toast.success('Registro exportado', { description: 'Se descargó el archivo CSV con todos los eventos.' });
    } catch (err) {
      toast.error('No se pudo exportar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Actividad"
        subtitle="Todo lo que se agrega, modifica o elimina, con fecha y hora exactas."
        actions={
          <Button iconLeft={<Download />} onClick={onExport} loading={exporting} disabled={!entries?.length}>
            Exportar CSV
          </Button>
        }
      />
      <Tabs
        idPrefix={PREFIX}
        aria-label="Secciones de actividad"
        value={tab}
        onChange={setTab}
        className={styles.tabs}
        items={[
          { value: 'registro', label: 'Registro', icon: <History />, count: entries?.length },
          { value: 'papelera', label: 'Papelera', icon: <Trash2 />, count: trash ? trashIds.size : undefined },
        ]}
      />
      <div {...tabPanelProps(PREFIX, tab)} className={styles.panel}>
        {tab === 'registro' ? (
          <ActivityLog entries={entries} trashIds={trashIds} query={route.query} />
        ) : (
          <TrashView trash={trash} onShowLog={() => setTab('registro')} />
        )}
      </div>
    </div>
  );
}
