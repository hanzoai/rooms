'use client'

// Which channel a message arrived on, as a mark.
//
// A message carries `channel` — the platform measures it — so this is a fact
// about the message and not decoration. The mark is what makes an inbox of many
// transports readable: a name tells you after you read it, a mark tells you
// before. The Channels grid asks a different question of the same set — which
// of these have you connected — so it reads this table too. Two tables would
// drift, and a channel called one thing in the Inbox and another in the grid is
// two channels to whoever is reading.
//
// NOTHING BELOW IS DRAWN BY US, and that is the whole of the design. A mark
// approximated by hand is a forgery that happens to be bad at it: it is close
// enough to be taken for the real thing and wrong enough to misidentify the
// product, which is how a Facebook card came to wear Messenger's bolt. So every
// mark here arrives from somewhere a reader can check, and there are exactly
// three ways in:
//
//   path   simple-icons 16.28.0, CC0-1.0. Imported, never transcribed, so the
//          silhouette is the project's own bytes and updates with the package.
//          It is one colour by design and sits on the brand's own hex.
//   art    the vendor's own file, byte for byte, for the brands simple-icons
//          delisted at their owners' request. Served as a data URI in an <img>
//          rather than inlined: an <img> gives each file its own document, so
//          the gradient ids inside four vendor SVGs cannot collide with each
//          other or with the page, and the artwork never has to be edited to
//          be safe. Editing it to fit would be redrawing it by another name.
//   glyph  a plain lucide glyph, for the rows that are CAPABILITIES rather than
//          brands — a phone call, a video call, the web widget, an IMAP
//          mailbox. None of those is a product with a logo, and dressing one in
//          a brand-coloured tile invents a company that does not exist.
//
// A brand we cannot draw takes none of the three: it gets its INITIAL on the
// neutral ground. Not on its own colour — a brand colour is half the mark, and
// a white Y on Yahoo purple is close enough to be read as the logo it is
// standing in for. Grey claims nothing, the letter tells two of them apart, and
// the tile keeps its place so the column still scans. Yahoo and LinkedIn are
// there now: both delisted, and neither publishes a square mark you can fetch.

import {
  MessageCircle,
  Phone,
  Server,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Text, View, YStack } from '@hanzo/ui'
import {
  siDiscord,
  siFacebook,
  siGmail,
  siIcloud,
  siInstagram,
  siMessenger,
  siReddit,
  siSignal,
  siTelegram,
  siTiktok,
  siWhatsapp,
  siX,
  siZoom,
} from 'simple-icons'

/* The vendor files, pasted unchanged. Each carries the address it came from,
   because provenance is the whole claim and it should travel with the bytes. */

/** Outlook — fetched https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/outlook_48x1.svg
 *  Verbatim; not one byte of it is ours. */
const OUTLOOK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="a" x1="28.5" y1="25" x2="28.5" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#35b8f1"/><stop offset="1" stop-color="#28a8ea"/></linearGradient><linearGradient id="b" x1="5.822" y1="11.568" x2="20.178" y2="36.432" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1784d9"/><stop offset=".5" stop-color="#107ad5"/><stop offset="1" stop-color="#0a63c9"/></linearGradient></defs><path d="M45 25a.96.96 0 0 0-.458-.825h-.005l-.018-.01-14.9-8.82a2.026 2.026 0 0 0-.2-.119 2 2 0 0 0-1.834 0 2.026 2.026 0 0 0-.2.119l-14.9 8.82-.018.01a.971.971 0 0 0 .023 1.663l14.9 8.82a2.241 2.241 0 0 0 .2.119 2 2 0 0 0 1.834 0 2.241 2.241 0 0 0 .2-.119l14.9-8.82A.959.959 0 0 0 45 25z" fill="#0a2767"/><path fill="#0364b8" d="M14.222 19.111H24v8.963h-9.778zM43 10V5.9A1.858 1.858 0 0 0 41.187 4H15.813A1.858 1.858 0 0 0 14 5.9V10l15 4z"/><path fill="#0078d4" d="M14 10h10v9H14z"/><path fill="#28a8ea" d="M34 10H24v9l10 9h9v-9l-9-9z"/><path fill="#0078d4" d="M24 19h10v9H24z"/><path fill="#0364b8" d="M24 28h10v9H24z"/><path fill="#14447d" d="M14.222 28.074H24v8.148h-9.778z"/><path fill="#0078d4" d="M34 28h9v9h-9z"/><path d="M44.542 25.783l-.019.01-14.9 8.38c-.065.04-.131.078-.2.112a2.077 2.077 0 0 1-.808.2l-.814-.476a2.033 2.033 0 0 1-.2-.115l-15.1-8.618h-.007L12 25v16.964A2.05 2.05 0 0 0 14.063 44h28.906c.017 0 .032-.008.05-.008a2.531 2.531 0 0 0 .7-.146A2.019 2.019 0 0 0 44 43.7c.067-.038.182-.121.182-.121A2.019 2.019 0 0 0 45 41.964V25a.9.9 0 0 1-.458.783z" fill="url(#a)"/><path d="M44.2 24.933v1.04L28.62 36.7 12.49 25.283a.01.01 0 0 0-.01-.01l-1.48-.89v-.75l.61-.01 1.29.74.03.01.11.07s15.16 8.65 15.2 8.67l.58.34c.05-.02.1-.04.16-.06.03-.02 15.05-8.47 15.05-8.47z" fill="#0a2767" opacity=".5"/><path fill="none" d="M0 0h48v48H0z"/><path d="M44.542 25.783l-.019.011-14.9 8.38c-.065.04-.131.078-.2.112a2.089 2.089 0 0 1-1.834 0 2.264 2.264 0 0 1-.2-.112l-14.9-8.38-.018-.011A.9.9 0 0 1 12 25v16.964A2.049 2.049 0 0 0 14.062 44h28.876A2.049 2.049 0 0 0 45 41.964V25a.9.9 0 0 1-.458.783z" fill="#1490df"/><path d="M29.84 34.05l-.223.125a2.183 2.183 0 0 1-.2.113 2.071 2.071 0 0 1-.786.208L34.3 41.2l9.889 2.383a2.038 2.038 0 0 0 .627-.783z" opacity=".1"/><path d="M30.85 33.482l-1.233.693a2.183 2.183 0 0 1-.2.113 2.071 2.071 0 0 1-.786.208l2.656 7.323 12.905 1.761A2.022 2.022 0 0 0 45 41.964v-.219z" opacity=".05"/><path d="M14.09 44h28.845a2.074 2.074 0 0 0 1.235-.4L27.8 34.011a2.033 2.033 0 0 1-.2-.115l-15.1-8.618h-.007L12 25v16.906A2.092 2.092 0 0 0 14.09 44z" fill="#28a8ea"/><path d="M26 13.833v21.33a1.838 1.838 0 0 1-1.15 1.7 1.723 1.723 0 0 1-.68.14H12V13h2v-1h10.17A1.837 1.837 0 0 1 26 13.833z" opacity=".1"/><path d="M25 14.833v21.33a1.629 1.629 0 0 1-.15.7A1.822 1.822 0 0 1 23.17 38H12V13h11.17a1.679 1.679 0 0 1 .83.21 1.818 1.818 0 0 1 1 1.623z" opacity=".2"/><path d="M25 14.833v19.33A1.846 1.846 0 0 1 23.17 36H12V13h11.17a1.679 1.679 0 0 1 .83.21 1.818 1.818 0 0 1 1 1.623z" opacity=".2"/><path d="M24 14.833v19.33A1.839 1.839 0 0 1 22.17 36H12V13h10.17A1.831 1.831 0 0 1 24 14.833z" opacity=".2"/><rect x="2" y="13" width="22" height="22" rx="1.833" fill="url(#b)"/><path d="M7.729 20.688a5.332 5.332 0 0 1 2.094-2.313 6.33 6.33 0 0 1 3.327-.834 5.892 5.892 0 0 1 3.079.791 5.284 5.284 0 0 1 2.037 2.21 7.133 7.133 0 0 1 .714 3.25 7.528 7.528 0 0 1-.735 3.4 5.41 5.41 0 0 1-2.1 2.287 6.126 6.126 0 0 1-3.194.812 6.02 6.02 0 0 1-3.147-.8 5.366 5.366 0 0 1-2.064-2.214 6.963 6.963 0 0 1-.722-3.211 7.733 7.733 0 0 1 .711-3.378zm2.232 5.43a3.461 3.461 0 0 0 1.178 1.522 3.077 3.077 0 0 0 1.84.554 3.223 3.223 0 0 0 1.964-.572 3.315 3.315 0 0 0 1.144-1.522 5.908 5.908 0 0 0 .365-2.123 6.463 6.463 0 0 0-.344-2.15A3.4 3.4 0 0 0 15 20.241a3.043 3.043 0 0 0-1.947-.6 3.175 3.175 0 0 0-1.883.559 3.49 3.49 0 0 0-1.2 1.535 6.1 6.1 0 0 0-.008 4.385z" fill="#fff"/><path fill="#50d9ff" d="M34 10h9v9h-9z"/></svg>`

/** Microsoft 365 — fetched https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/m365_48x1.svg
 *  Verbatim; not one byte of it is ours. */
const MICROSOFT365 = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M20.0842 3.02539L19.8595 3.1613C19.5021 3.3775 19.1654 3.61923 18.8512 3.88336L19.4993 3.42749H25L26 10.9995L21 15.9995L16 19.4749V23.4824C16 26.2814 17.4629 28.8769 19.8574 30.3263L25.1211 33.5124L14 39.9997H11.8551L7.85737 37.5799C5.46286 36.1305 4 33.535 4 30.736V17.2601C4 14.4602 5.46379 11.864 7.85952 10.4149L19.8595 3.15638C19.9339 3.11141 20.0088 3.06774 20.0842 3.02539Z" fill="url(#paint0_radial_48543_184825)"/>
<path d="M20.0842 3.02539L19.8595 3.1613C19.5021 3.3775 19.1654 3.61923 18.8512 3.88336L19.4993 3.42749H25L26 10.9995L21 15.9995L16 19.4749V23.4824C16 26.2814 17.4629 28.8769 19.8574 30.3263L25.1211 33.5124L14 39.9997H11.8551L7.85737 37.5799C5.46286 36.1305 4 33.535 4 30.736V17.2601C4 14.4602 5.46379 11.864 7.85952 10.4149L19.8595 3.15638C19.9339 3.11141 20.0088 3.06774 20.0842 3.02539Z" fill="url(#paint1_linear_48543_184825)"/>
<path d="M31.9973 19V23.4803C31.9973 26.2793 30.5344 28.8748 28.1399 30.3242L16.1399 37.5878C13.6852 39.0737 10.6308 39.1273 8.13281 37.7487L19.8546 44.844C22.4013 46.3855 25.5932 46.3855 28.1399 44.844L40.1399 37.5803C42.5344 36.1309 43.9972 33.5354 43.9972 30.7364V27.5L42.9973 26L31.9973 19Z" fill="url(#paint2_radial_48543_184825)"/>
<path d="M31.9973 19V23.4803C31.9973 26.2793 30.5344 28.8748 28.1399 30.3242L16.1399 37.5878C13.6852 39.0737 10.6308 39.1273 8.13281 37.7487L19.8546 44.844C22.4013 46.3855 25.5932 46.3855 28.1399 44.844L40.1399 37.5803C42.5344 36.1309 43.9972 33.5354 43.9972 30.7364V27.5L42.9973 26L31.9973 19Z" fill="url(#paint3_linear_48543_184825)"/>
<path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#paint4_radial_48543_184825)"/>
<path d="M40.1405 10.4153L28.1405 3.15678C25.6738 1.66471 22.6021 1.61849 20.0979 3.01811L19.8595 3.16231C17.4638 4.61143 16 7.20757 16 10.0075V19.4914L19.8595 17.1568C22.4051 15.6171 25.5949 15.6171 28.1405 17.1568L40.1405 24.4153C42.4613 25.8192 43.9076 28.2994 43.9957 30.9985C43.9986 30.9113 44 30.824 44 30.7364V17.2605C44 14.4606 42.5362 11.8644 40.1405 10.4153Z" fill="url(#paint5_linear_48543_184825)"/>
<path d="M4.00428 30.9984C4.00428 30.9984 4.00428 30.9984 4.00428 30.9984Z" fill="url(#paint6_radial_48543_184825)"/>
<path d="M4.00428 30.9984C4.00428 30.9984 4.00428 30.9984 4.00428 30.9984Z" fill="url(#paint7_linear_48543_184825)"/>
<defs>
<radialGradient id="paint0_radial_48543_184825" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.4186 10.6379) rotate(110.528) scale(33.3657 58.1966)">
<stop offset="0.06441" stop-color="#AE7FE2"/>
<stop offset="1" stop-color="#0078D4"/>
</radialGradient>
<linearGradient id="paint1_linear_48543_184825" x1="17.5119" y1="37.868" x2="12.7513" y2="29.6342" gradientUnits="userSpaceOnUse">
<stop stop-color="#114A8B"/>
<stop offset="1" stop-color="#0078D4" stop-opacity="0"/>
</linearGradient>
<radialGradient id="paint2_radial_48543_184825" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.4272 36.3511) rotate(-8.36717) scale(31.0503 20.5108)">
<stop offset="0.133928" stop-color="#D59DFF"/>
<stop offset="1" stop-color="#5E438F"/>
</radialGradient>
<linearGradient id="paint3_linear_48543_184825" x1="40.3539" y1="25.3768" x2="35.2525" y2="32.6916" gradientUnits="userSpaceOnUse">
<stop stop-color="#493474"/>
<stop offset="1" stop-color="#8C66BA" stop-opacity="0"/>
</linearGradient>
<radialGradient id="paint4_radial_48543_184825" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(41.0552 26.504) rotate(-165.772) scale(24.9228 41.9552)">
<stop offset="0.0584996" stop-color="#50E6FF"/>
<stop offset="1" stop-color="#436DCD"/>
</radialGradient>
<linearGradient id="paint5_linear_48543_184825" x1="16.9758" y1="3.05655" x2="24.4868" y2="3.05655" gradientUnits="userSpaceOnUse">
<stop stop-color="#2D3F80"/>
<stop offset="1" stop-color="#436DCD" stop-opacity="0"/>
</linearGradient>
<radialGradient id="paint6_radial_48543_184825" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(41.0552 26.504) rotate(-165.772) scale(24.9228 41.9552)">
<stop offset="0.0584996" stop-color="#50E6FF"/>
<stop offset="1" stop-color="#436DCD"/>
</radialGradient>
<linearGradient id="paint7_linear_48543_184825" x1="16.9758" y1="3.05655" x2="24.4868" y2="3.05655" gradientUnits="userSpaceOnUse">
<stop stop-color="#2D3F80"/>
<stop offset="1" stop-color="#436DCD" stop-opacity="0"/>
</linearGradient>
</defs>
</svg>`

/** Teams — fetched https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/teams_48x1.svg
 *  Verbatim; not one byte of it is ours. */
const TEAMS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="a" x1="5.822" y1="11.568" x2="20.178" y2="36.432" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5a62c3"/><stop offset=".5" stop-color="#4d55bd"/><stop offset="1" stop-color="#3940ab"/></linearGradient></defs><path d="M31.993 19H43.1a1.9 1.9 0 0 1 1.9 1.9v10.117A6.983 6.983 0 0 1 38.017 38h-.033A6.983 6.983 0 0 1 31 31.017V19.993a.993.993 0 0 1 .993-.993z" fill="#5059c9"/><circle cx="39.5" cy="12.5" r="4.5" fill="#5059c9"/><circle cx="25.5" cy="10.5" r="6.5" fill="#7b83eb"/><path d="M34.167 19H15.833A1.88 1.88 0 0 0 14 20.923v11.539A11.279 11.279 0 0 0 25 44a11.279 11.279 0 0 0 11-11.538V20.923A1.88 1.88 0 0 0 34.167 19z" fill="#7b83eb"/><path fill="none" d="M0 0h48v48H0z"/><path d="M26 19v16.17a1.841 1.841 0 0 1-1.14 1.69 1.772 1.772 0 0 1-.69.14h-9.29c-.13-.33-.25-.66-.35-1a12.179 12.179 0 0 1-.53-3.54V20.92A1.877 1.877 0 0 1 15.83 19z" opacity=".1"/><path d="M25 19v17.17a1.772 1.772 0 0 1-.14.69A1.841 1.841 0 0 1 23.17 38h-7.82c-.17-.33-.33-.66-.47-1s-.25-.66-.35-1a12.179 12.179 0 0 1-.53-3.54V20.92A1.877 1.877 0 0 1 15.83 19z" opacity=".2"/><path d="M25 19v15.17A1.844 1.844 0 0 1 23.17 36h-8.64a12.179 12.179 0 0 1-.53-3.54V20.92A1.877 1.877 0 0 1 15.83 19z" opacity=".2"/><path d="M24 19v15.17A1.844 1.844 0 0 1 22.17 36h-7.64a12.179 12.179 0 0 1-.53-3.54V20.92A1.877 1.877 0 0 1 15.83 19z" opacity=".2"/><path d="M26 13.83v3.15c-.17.01-.33.02-.5.02s-.33-.01-.5-.02a5.489 5.489 0 0 1-1-.16A6.5 6.5 0 0 1 19.5 13a5.556 5.556 0 0 1-.32-1h4.99A1.837 1.837 0 0 1 26 13.83z" opacity=".1"/><path d="M25 14.83v2.15a5.489 5.489 0 0 1-1-.16A6.5 6.5 0 0 1 19.5 13h3.67A1.837 1.837 0 0 1 25 14.83z" opacity=".2"/><path d="M25 14.83v2.15a5.489 5.489 0 0 1-1-.16A6.5 6.5 0 0 1 19.5 13h3.67A1.837 1.837 0 0 1 25 14.83z" opacity=".2"/><path d="M24 14.83v1.99A6.5 6.5 0 0 1 19.5 13h2.67A1.837 1.837 0 0 1 24 14.83z" opacity=".2"/><rect x="2" y="13" width="22" height="22" rx="1.833" fill="url(#a)"/><path d="M17.824 19.978h-3.665v9.98h-2.335v-9.98H8.176v-1.936h9.648z" fill="#fff"/></svg>`

/** Slack — fetched https://a.slack-edge.com/38f0e7c/marketing/img/nav/logo.svg
 *  Verbatim; not one byte of it is ours. */
const SLACK = `<svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_4127_70105)">
<path d="M11.379 33.9993C11.379 37.1358 8.84512 39.6507 5.7276 39.6507C2.61008 39.6507 0.0572205 37.1168 0.0572205 33.9993C0.0572205 30.8817 2.5911 28.3479 5.70862 28.3479H11.36V33.9993H11.379Z" fill="#E01E5A"/>
<path d="M14.1962 33.9997C14.1962 30.8632 16.7301 28.3483 19.8476 28.3483C22.9651 28.3483 25.499 30.8822 25.499 33.9997V48.1353C25.499 51.2718 22.9651 53.7867 19.8476 53.7867C16.7301 53.7867 14.1962 51.2718 14.1962 48.1353V33.9997Z" fill="#E01E5A"/>
<path d="M19.8662 11.2673C16.7296 11.2673 14.2148 8.73347 14.2148 5.61594C14.2148 2.49842 16.7486 -0.0354538 19.8662 -0.0354538C22.9837 -0.0354538 25.5175 2.49842 25.5175 5.61594V11.2673H19.8662Z" fill="#36C5F0"/>
<path d="M19.8682 14.1334C23.0047 14.1334 25.5196 16.6673 25.5196 19.7848C25.5196 22.9023 22.9857 25.4362 19.8682 25.4362H5.67566C2.53916 25.4362 0.0242615 22.9023 0.0242615 19.7848C0.0242615 16.6673 2.55814 14.1334 5.67566 14.1334H19.8682Z" fill="#36C5F0"/>
<path d="M42.5323 19.7853C42.5323 16.6488 45.0662 14.1339 48.1837 14.1339C51.3012 14.1339 53.8351 16.6678 53.8351 19.7853C53.8351 22.9028 51.3012 25.4367 48.1837 25.4367H42.5323V19.7853Z" fill="#2EB67D"/>
<path d="M39.7126 19.7934C39.7126 22.9299 37.1787 25.4448 34.0612 25.4448C30.9436 25.4448 28.4098 22.911 28.4098 19.7934V5.61986C28.4098 2.48336 30.9436 -0.0315399 34.0612 -0.0315399C37.1787 -0.0315399 39.7126 2.48336 39.7126 5.61986V19.7934Z" fill="#2EB67D"/>
<path d="M34.0376 42.482C37.1741 42.482 39.689 45.0158 39.689 48.1334C39.689 51.2509 37.1552 53.7848 34.0376 53.7848C30.9201 53.7848 28.3862 51.2509 28.3862 48.1334V42.482H34.0376Z" fill="#ECB22E"/>
<path d="M34.0381 39.6507C30.9016 39.6507 28.3867 37.1168 28.3867 33.9993C28.3867 30.8818 30.9206 28.3479 34.0381 28.3479H48.2306C51.3671 28.3479 53.882 30.8818 53.882 33.9993C53.882 37.1168 51.3482 39.6507 48.2306 39.6507H34.0381Z" fill="#ECB22E"/>
</g>
<defs>
<clipPath id="clip0_4127_70105">
<rect width="54" height="54" fill="white"/>
</clipPath>
</defs>
</svg>`

/** The ground for a channel nobody has told us the colour of. */
const NEUTRAL = 'var(--neutral-600)'

interface Net {
  /** What a person calls it. */
  name: string
  /** The brand's own colour, `#rrggbb`, where a silhouette needs a ground. */
  hex?: string
  /** The 24x24 silhouette, where simple-icons ships one. */
  path?: string
  /** The vendor's own SVG, where simple-icons ships none and the vendor
   *  publishes one that can be fetched. */
  art?: string
  /** Set where the row is a capability rather than a brand. */
  glyph?: LucideIcon
}

/**
 * The channels, keyed by what the platform puts in `channel`.
 *
 * Lowercase because that is how it arrives. A key nobody has taught this table
 * still renders — `of()` falls back to the channel's own name and a neutral
 * ground — so a fifth transport appearing on the server needs no release here.
 */
const NETWORK: Record<string, Net> = {
  gmail: { name: 'Gmail', hex: `#${siGmail.hex}`, path: siGmail.path },
  icloud: { name: 'iCloud', hex: `#${siIcloud.hex}`, path: siIcloud.path },
  discord: { name: 'Discord', hex: `#${siDiscord.hex}`, path: siDiscord.path },
  telegram: { name: 'Telegram', hex: `#${siTelegram.hex}`, path: siTelegram.path },
  facebook: { name: 'Facebook', hex: `#${siFacebook.hex}`, path: siFacebook.path },
  messenger: { name: 'Messenger', hex: `#${siMessenger.hex}`, path: siMessenger.path },
  instagram: { name: 'Instagram', hex: `#${siInstagram.hex}`, path: siInstagram.path },
  tiktok: { name: 'TikTok', hex: `#${siTiktok.hex}`, path: siTiktok.path },
  whatsapp: { name: 'WhatsApp', hex: `#${siWhatsapp.hex}`, path: siWhatsapp.path },
  signal: { name: 'Signal', hex: `#${siSignal.hex}`, path: siSignal.path },
  reddit: { name: 'Reddit', hex: `#${siReddit.hex}`, path: siReddit.path },
  zoom: { name: 'Zoom', hex: `#${siZoom.hex}`, path: siZoom.path },
  x: { name: 'X', hex: `#${siX.hex}`, path: siX.path },

  outlook: { name: 'Outlook', art: OUTLOOK },
  // Microsoft retired the Hotmail mark when it moved the mail to Outlook, and a
  // hotmail.com address signs in there. The Outlook mark is the true one to
  // show, so this row and Outlook's wear the same artwork on purpose.
  hotmail: { name: 'Hotmail', art: OUTLOOK },
  microsoft365: { name: 'Microsoft 365', art: MICROSOFT365 },
  teams: { name: 'Teams', art: TEAMS },
  slack: { name: 'Slack', art: SLACK },

  calls: { name: 'Calls', glyph: Phone },
  video: { name: 'Video', glyph: Video },
  webchat: { name: 'WebChat', glyph: MessageCircle },
  imap: { name: 'IMAP', glyph: Server },

  // No mark to be had: delisted from simple-icons, and nothing square published
  // anywhere you can fetch. No hex either — see above; the colour is part of
  // what we do not have.
  yahoo: { name: 'Yahoo' },
  linkedin: { name: 'LinkedIn' },
}

/** What we know about a channel key, including one nobody taught us — which is
 *  a name and nothing else, and lands on the same initial Yahoo does. */
export function of(channel: string): Net {
  const key = (channel || '').trim().toLowerCase()
  return NETWORK[key] ?? { name: channel || 'Network' }
}

/**
 * WHAT TO CALL THE SPEAKER.
 *
 * NOTHING THAT ARRIVES HERE CARRIES A NAME. `sender` is the network's own id
 * for the person — "U031THJJ7F1" on Slack, a snowflake on Discord, a GUID on
 * Teams — because that is what every adapter puts there; the envelope declares
 * a `Display` beside it (cloud apps/channels/envelope.go) and not one of the
 * five adapters fills it, so no name is stored and none is served.
 * `senderUser` is not the name either: it is the linked account's OIDC `sub`,
 * which IAM mints from a UUID, so it identifies a Hanzo account without saying
 * who holds it — printing it swaps one opaque string for another.
 *
 * An id printed where a name goes READS as a name, and a reader takes
 * "U031THJJ7F1" for what somebody calls themselves. So the id is MARKED as an
 * id — '@' is how every one of these networks writes a handle it has not
 * resolved — and it is kept, because it is the only thing that tells two
 * speakers apart. A room holds messages from many people (useInbox groups by
 * channel and room, never by sender), so dropping it renders every line of a
 * group identically and a reader cannot tell who said what. Only where no id
 * arrived at all is the network the one thing left to say. The day the
 * platform resolves a name, this is where it goes.
 */
export const speaker = (channel: string, sender?: string): string =>
  sender ? `@${sender}` : `Someone on ${of(channel).name}`

/** A room is named by its own address, not by whoever spoke in it last: the
 *  handle for a DM, the network's room id otherwise. */
export function roomName(room: { channel: string; roomId?: string; roomKind: string; last: { sender?: string } }): string {
  if (room.roomKind === 'dm') return speaker(room.channel, room.last.sender)
  return room.roomId ? `#${room.roomId}` : `A room on ${of(room.channel).name}`
}

/**
 * One channel's mark, at whatever size the caller has room for.
 *
 * A rounded square rather than a disc, because in the Inbox the face beside it
 * IS a disc and two circles the same size read as two people rather than as a
 * person and where they wrote from. The Channels grid draws the same mark at
 * 46px, which is the size the vendor files were cut for and still the size the
 * simple-icons silhouettes were meant to scale to.
 */
export function Network({ channel, size = 16 }: { channel: string; size?: number }) {
  const net = of(channel)

  // A capability wears no ground and no colour. It is not a product, and a tile
  // in a brand colour is the one thing that would say it was.
  if (net.glyph) {
    const Glyph = net.glyph
    return (
      <YStack
        width={size}
        height={size}
        items="center"
        justify="center"
        shrink={0}
        aria-label={net.name}
      >
        <Glyph size={Math.round(size * 0.72)} color="var(--soft, var(--muted-foreground))" strokeWidth={1.75} />
      </YStack>
    )
  }

  // The vendor's file carries its own colours, so it takes the whole footprint
  // and wears no ground of ours. Its own document, so its ids stay its own.
  if (net.art) {
    return (
      <View
        render={<img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(net.art)}`} alt={net.name} width={size} height={size} />}
        width={size}
        height={size}
        display="block"
      />
    )
  }

  return (
    <YStack
      width={size}
      height={size}
      rounded={Math.round(size / 3)}
      items="center"
      justify="center"
      shrink={0}
      bg={(net.hex ?? NEUTRAL) as never}
      aria-label={net.name}
    >
      {net.path ? (
        <svg
          role="presentation"
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          viewBox="0 0 24 24"
          fill="#fff"
        >
          <path d={net.path} />
        </svg>
      ) : (
        <Text fontSize={Math.round(size * 0.5)} fontWeight="700" color="var(--pure-white)">
          {net.name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </YStack>
  )
}
