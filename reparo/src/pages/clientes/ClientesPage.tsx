import { useRef } from 'react';
import { setQuery, useRoute } from '@/app/router';
import { ClientDetail } from './detail/ClientDetail';
import { ClientForm } from './ClientForm';
import { ClientList } from './ClientList';

/**
 * Clientes:
 *   #/clientes                 lista (filtros: ?estado=<RepairStatus>|taller|listo|entregado|cancelado)
 *   #/clientes?nuevo=1         lista + formulario de alta
 *   #/clientes/<id>            detalle
 *   #/clientes/<id>?editar=1   detalle + formulario de edición encima
 */
export default function ClientesPage() {
  const route = useRoute();
  const id = route.params[0] ?? null;
  const formOpen = id ? route.query.get('editar') === '1' : route.query.get('nuevo') === '1';
  const formTarget = id ?? null;

  // Nueva sesión del formulario en cada apertura (sin cortar la animación de salida).
  const session = useRef({ n: 0, open: false, target: null as string | null });
  if (formOpen && (!session.current.open || session.current.target !== formTarget)) {
    session.current = { n: session.current.n + 1, open: true, target: formTarget };
  } else if (!formOpen && session.current.open) {
    session.current = { ...session.current, open: false };
  }

  const close = () => setQuery(id ? { editar: null } : { nuevo: null });

  return (
    <>
      {id ? <ClientDetail id={id} /> : <ClientList />}
      <ClientForm key={`${session.current.n}`} open={formOpen} clientId={session.current.target} onClose={close} />
    </>
  );
}
