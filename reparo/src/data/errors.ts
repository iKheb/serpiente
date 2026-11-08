/** Error de validación con mensajes en español por campo. */
export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>, message?: string) {
    const first = Object.values(fields)[0];
    super(message ?? first ?? 'Revisa los datos capturados');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/** El registro solicitado no existe (o se eliminó definitivamente). */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** El archivo de respaldo no es válido o es de una versión incompatible. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}
