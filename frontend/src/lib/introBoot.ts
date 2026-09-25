/** Storage key for the home-page intro, and the pre-paint script that reads
 *  it. A plain module for the same reason as readabilityBoot: the layout
 *  inlines the script as a string.
 *
 *  The intro is server-rendered on the home page, so a reader who has already
 *  seen it this session has to have it hidden before the first paint — hiding
 *  it from React would flash the grass for a frame on every reload. */
export const INTRO_KEY = "pamesentra:intro";

export const INTRO_BOOT =
  `try{if(sessionStorage.getItem('${INTRO_KEY}'))` +
  `document.documentElement.setAttribute('data-intro','seen');}catch(e){}`;
