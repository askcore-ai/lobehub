const escapeAttribute = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

const escapeText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const handoffFailureDocumentCSP =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export interface HandoffFailureDocument {
  locale: string;
  message: string;
  recoveryHref: string;
  recoveryLabel: string;
  status: number;
  title: string;
}

export const renderHandoffFailureDocument = ({
  locale,
  message,
  recoveryHref,
  recoveryLabel,
  status,
  title,
}: HandoffFailureDocument) => {
  const safeRecoveryHref =
    recoveryHref.startsWith('/') && !recoveryHref.startsWith('//') ? recoveryHref : '/school';
  return `<!doctype html><html lang="${escapeAttribute(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title></head><body><main data-askcore-handoff-error data-status="${status}"><h1>${escapeText(title)}</h1><p role="alert" aria-live="assertive">${escapeText(message)}</p><a href="${escapeAttribute(safeRecoveryHref)}">${escapeText(recoveryLabel)}</a></main></body></html>`;
};
