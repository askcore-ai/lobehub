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

export interface HandoffSuccessDocument {
  action: string;
  continueLabel: string;
  grant: string;
  locale: string;
  message: string;
  nonce: string;
  title: string;
}

export const renderHandoffSuccessDocument = ({
  action,
  continueLabel,
  grant,
  locale,
  message,
  nonce,
  title,
}: HandoffSuccessDocument) => {
  const safeAction = action.startsWith('/') && !action.startsWith('//') ? action : '/school';
  return `<!doctype html><html lang="${escapeAttribute(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(title)}</title></head><body><main><h1>${escapeText(title)}</h1><p role="status" aria-live="polite">${escapeText(message)}</p><form id="handoff" method="post" action="${escapeAttribute(safeAction)}"><input type="hidden" name="grant" value="${escapeAttribute(grant)}"><button type="submit">${escapeText(continueLabel)}</button></form></main><script nonce="${escapeAttribute(nonce)}">document.getElementById('handoff').requestSubmit()</script></body></html>`;
};

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
