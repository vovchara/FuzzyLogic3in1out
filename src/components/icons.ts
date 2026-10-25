/**
 * Inline icons shared by buttons. They inherit the text colour and sit before
 * the label, so a button carrying one puts its label in a child span: data-i18n
 * on the button itself would overwrite the icon with the text.
 */

/** Arrow into a tray: the button saves a file. */
export const DOWNLOAD_ICON = `
  <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 3v10"/>
    <path d="M6 9l4 4 4-4"/>
    <path d="M4 16h12"/>
  </svg>`;

/** Counter-clockwise arrow: "back to how it was". */
export const ROLLBACK_ICON = `
  <svg class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 4v4h4"/>
    <path d="M4.5 8A6 6 0 1 1 4 11"/>
  </svg>`;
