import { openExternal } from "@/app/external";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion } from "motion/react";
import {
  Copy,
  ImageDown,
  Info,
  MessageCircle,
  Printer,
  ReceiptText,
} from "lucide-react";
import { MARK, BRAND_GRADIENT } from "@/app/brand";
import {
  buildReceiptText,
  updateClient,
  useSettings,
  whatsappUrl,
  type Client,
} from "@/data";
import {
  Button,
  Checkbox,
  Input,
  Sheet,
  Skeleton,
  toast,
  usePrefersReducedMotion,
} from "@/ui";
import {
  buildReceiptModel,
  paperCssVars,
  type ReceiptModel,
  type ReceiptRow,
} from "./receiptModel";
import { printReceipt } from "./receiptPrint";
import { shareReceiptImage, useReceiptPieces } from "./actions";
import { copyText } from "./clipboard";
import styles from "./ReceiptSheet.module.css";

export interface ReceiptSheetProps {
  client: Client;
  open: boolean;
  onClose: () => void;
}

/** Hoja con la vista previa del recibo (ticket) y acciones para enviarlo. */
export function ReceiptSheet({ client, open, onClose }: ReceiptSheetProps) {
  const settings = useSettings();
  const piezas = useReceiptPieces(client.id);
  const [phone, setPhone] = useState("");
  const [savePhone, setSavePhone] = useState(true);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const hasPhone = !!client.telefono.trim();

  useEffect(() => {
    if (open) {
      setPhone("");
      setPhoneError(null);
    }
  }, [open]);

  const model = useMemo(
    () => (settings ? buildReceiptModel(client, settings, piezas) : null),
    [client, settings, piezas],
  );

  const sendWhatsApp = async () => {
    if (!settings) return;
    const target = hasPhone ? client.telefono : phone.trim();
    if (!target) {
      setPhoneError("Escribe el número de WhatsApp del cliente.");
      phoneRef.current?.focus();
      return;
    }
    if (target.replace(/\D/g, "").length < 7) {
      setPhoneError("El número parece incompleto.");
      phoneRef.current?.focus();
      return;
    }
    const text = buildReceiptText(client, settings, { piezas });
    openExternal(whatsappUrl(target, text, settings.phoneCountryCode));
    if (!hasPhone && savePhone) {
      try {
        await updateClient(client.id, { telefono: target });
      } catch {
        /* el envío ya se hizo; guardar el número es opcional */
      }
    }
    toast({
      title: "Abriendo WhatsApp…",
      description: "Revisa el mensaje y pulsa Enviar.",
      tone: "success",
    });
  };

  const shareImage = async () => {
    if (!settings) return;
    setSharing(true);
    await shareReceiptImage(client, settings, piezas);
    setSharing(false);
  };

  const copy = async () => {
    if (!settings) return;
    const ok = await copyText(buildReceiptText(client, settings, { piezas }));
    toast(
      ok
        ? {
            title: "Recibo copiado",
            description: "Pégalo en cualquier chat.",
            tone: "success",
          }
        : { title: "No se pudo copiar", tone: "danger" },
    );
  };

  const missing =
    model && (model.missingBusiness.phone || model.missingBusiness.address);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      icon={<ReceiptText />}
      title="Recibo de servicio"
      description={
        model ? `${model.folio} · ${client.nombre || "Cliente"}` : undefined
      }
      bodyClassName={styles.body}
      footer={
        <div className={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            iconLeft={<MessageCircle />}
            onClick={sendWhatsApp}
            disabled={!settings}
            className={styles.cta}
          >
            Enviar por WhatsApp
          </Button>
          <div className={styles.secondary}>
            <Button
              iconLeft={<ImageDown />}
              onClick={shareImage}
              loading={sharing}
              disabled={!settings}
            >
              <span className={styles.longLabel}>Compartir imagen</span>
              <span className={styles.shortLabel}>Imagen</span>
            </Button>
            <Button
              iconLeft={<Printer />}
              onClick={() => model && printReceipt(model)}
              disabled={!model}
            >
              Imprimir
            </Button>
            <Button iconLeft={<Copy />} onClick={copy} disabled={!settings}>
              <span className={styles.longLabel}>Copiar texto</span>
              <span className={styles.shortLabel}>Copiar</span>
            </Button>
          </div>
        </div>
      }
    >
      {!hasPhone && (
        <div className={styles.phoneBox}>
          <Input
            ref={phoneRef}
            label="WhatsApp del cliente"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="55 1234 5678"
            value={phone}
            error={phoneError ?? undefined}
            hint={
              settings
                ? `Este cliente no tiene teléfono. Se usará el código de país +${settings.phoneCountryCode}.`
                : undefined
            }
            onValueChange={(v) => {
              setPhone(v);
              if (phoneError) setPhoneError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendWhatsApp();
              }
            }}
          />
          <Checkbox
            checked={savePhone}
            onChange={setSavePhone}
            label="Guardar este número en el cliente"
          />
        </div>
      )}

      <div className={styles.stage}>
        {model ? <Ticket model={model} /> : <TicketSkeleton />}
      </div>
      {missing && (
        <p className={styles.notice} role="note">
          <Info aria-hidden />
          <span className={styles.noticeText}>
            {model.missingBusiness.phone && model.missingBusiness.address
              ? 'Falta el teléfono y la dirección del negocio.'
              : model.missingBusiness.phone
                ? 'Falta el teléfono del negocio.'
                : 'Falta la dirección del negocio.'}
          </span>
          <a href="#/ajustes" onClick={onClose}>
            Completar en Ajustes
          </a>
        </p>
      )}
      <p className={styles.privacy}>
        El recibo nunca incluye el PIN, la contraseña ni el patrón de
        desbloqueo.
      </p>
    </Sheet>
  );
}

/* ------------------------------- Ticket ---------------------------------- */

function BrandMark({ size = 36 }: { size?: number }) {
  const { phone: p, speaker: s } = MARK;
  const gid = "rcpt-mark-g";
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK.viewBox}
      aria-hidden
      className={styles.mark}
    >
      <defs>
        <linearGradient
          id={gid}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={BRAND_GRADIENT[0]} />
          <stop offset=".5" stopColor={BRAND_GRADIENT[1]} />
          <stop offset="1" stopColor={BRAND_GRADIENT[2]} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={MARK.tile.r} fill={`url(#${gid})`} />
      <rect
        x={p.x}
        y={p.y}
        width={p.w}
        height={p.h}
        rx={p.r}
        fill="none"
        stroke="var(--paper-bg)"
        strokeWidth={p.stroke}
      />
      <line
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        stroke="var(--paper-bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <polyline
        points={MARK.pulse}
        fill="none"
        stroke="var(--paper-bg)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Rows({ rows }: { rows: ReceiptRow[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((r) =>
        r.block ? (
          <div key={r.label} className={styles.rowBlock}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ) : (
          <div key={r.label} className={styles.row}>
            <dt>{r.label}</dt>
            <dd className={r.mono ? styles.mono : undefined}>{r.value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

export function Ticket({ model: m }: { model: ReceiptModel }) {
  const reduced = usePrefersReducedMotion();
  const pending = m.totals.saldoCents > 0;
  return (
    <motion.div
      className={styles.paper}
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <article
        className={styles.ticket}
        style={paperCssVars() as CSSProperties}
        aria-label={`Vista previa del recibo ${m.folio}`}
      >
        <header className={styles.tHead}>
          <BrandMark />
          <strong className={styles.biz}>{m.business.name}</strong>
          {m.business.phone && (
            <span className={styles.bizSub}>{m.business.phone}</span>
          )}
          {m.business.address && (
            <span className={styles.bizSub}>{m.business.address}</span>
          )}
        </header>
        <hr className={styles.rule} />
        <div className={styles.folioBlock}>
          <span className={styles.cap}>Recibo de servicio</span>
          <span className={styles.folio}>{m.folio}</span>
          <span className={styles.date}>{m.dateText}</span>
        </div>
        <hr className={styles.rule} />
        <Rows rows={[...m.client, ...m.device]} />
        {m.piezas.length > 0 && (
          <>
            <hr className={styles.rule} />
            <span className={styles.cap}>Piezas utilizadas</span>
            <ul className={styles.pieces}>
              {m.piezas.map((p) => (
                <li key={p.nombre}>
                  <span className={styles.qty}>{p.cantidad} ×</span>
                  <span>{p.nombre}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <hr className={styles.rule} />
        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Total</span>
            <span className={styles.totalAmount}>{m.totals.total}</span>
          </div>
          <div className={styles.sumRow}>
            <span>Abonado</span>
            <span className={styles.paid}>{m.totals.abonado}</span>
          </div>
          <div className={styles.sumRow} data-pending={pending || undefined}>
            <span>{pending ? "Saldo pendiente" : "Saldo"}</span>
            <span className={styles.saldo}>{m.totals.saldo}</span>
          </div>
          <div className={styles.payMeta}>
            <span>
              {m.metodo ? `Pago: ${m.metodo}` : "Sin pagos registrados"}
            </span>
            <span
              className={styles.payChip}
              data-pending={pending || undefined}
            >
              {m.totals.statusLabel}
            </span>
          </div>
        </div>
        <hr className={styles.rule} />
        <Rows rows={[{ label: "Garantía", value: m.garantia }]} />
        {m.footer && (
          <>
            <hr className={styles.rule} />
            <p className={styles.foot}>{m.footer}</p>
          </>
        )}
      </article>
    </motion.div>
  );
}

function TicketSkeleton() {
  return (
    <div className={styles.ticketSkeleton} aria-hidden>
      <Skeleton circle height={36} />
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={10} />
      <Skeleton lines={8} height={10} />
    </div>
  );
}
