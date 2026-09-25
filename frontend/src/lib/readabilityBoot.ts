/** Storage keys for the readability switches, and the pre-paint script that
 *  reads them. A plain module, not a client one: the layout (a server
 *  component) inlines the script, and a "use client" export would reach it as
 *  a reference rather than a string. */
export const READABILITY_KEYS = {
  large: "pamesentra:text-large",
  contrast: "pamesentra:contrast-high",
} as const;

export const READABILITY_BOOT =
  `try{var d=document.documentElement;` +
  `if(localStorage.getItem('${READABILITY_KEYS.large}')==='1')d.setAttribute('data-text','large');` +
  `if(localStorage.getItem('${READABILITY_KEYS.contrast}')==='1')d.setAttribute('data-contrast','high');}catch(e){}`;
