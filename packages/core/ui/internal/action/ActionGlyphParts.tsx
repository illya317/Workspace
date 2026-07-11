import type { ActionGlyphRenderProps } from "./ActionGlyphPartsTypes";
import { PermissionActionGlyph } from "./ActionGlyphPermissionParts";
import { ArrowLeft, BotMessageSquare, ChevronDown, ChevronRight } from "lucide-react";

export function ActionGlyph({ kind, className = "h-5 w-5" }: ActionGlyphRenderProps) {
  if (kind === "permission-organization" || kind === "permission-derived") return <PermissionActionGlyph kind={kind} className={className} />;
  if (kind === "add") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }
  if (kind === "send") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <path d="M21 3 10 14" />
        <path d="m21 3-7 18-4-7-7-4z" />
      </svg>
    );
  }
  if (kind === "stop") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
        <rect x="7" y="7" width="10" height="10" rx="2" />
      </svg>
    );
  }
  if (kind === "edit") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="m16.9 4.6 2.5 2.5" />
        <path d="M4.5 19.5l4.9-1 9.2-9.2a1.8 1.8 0 0 0 0-2.5l-1.4-1.4a1.8 1.8 0 0 0-2.5 0l-9.2 9.2-1 4.9z" />
      </svg>
    );
  }
  if (kind === "revise") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth={3} viewBox="0 0 100 100">
        <path d="m4.6875 54.074c0 22.738 18.5 41.238 41.242 41.238 22.738 0 41.238-18.5 41.238-41.238 0-0.86328-0.69922-1.5625-1.5625-1.5625s-1.5625 0.69922-1.5625 1.5625c0 21.016-17.098 38.113-38.113 38.113-21.016 0-38.117-17.098-38.117-38.113 0-19.977 15.461-36.383 35.039-37.957l-6.3555 9.25c-0.48828 0.71094-0.30859 1.6836 0.40234 2.1719 0.27344 0.1875 0.57812 0.27344 0.88672 0.27344 0.49609 0 0.98438-0.23828 1.2891-0.67578l8.1445-11.852c0.03125-0.042968 0.035156-0.09375 0.058594-0.13672 0.050781-0.09375 0.089844-0.1875 0.125-0.29297 0.03125-0.10156 0.050781-0.19922 0.0625-0.30469 0.003906-0.050781 0.03125-0.097656 0.03125-0.14844 0-0.046875-0.023438-0.089844-0.027344-0.13672-0.007812-0.10547-0.03125-0.20703-0.0625-0.30859-0.027344-0.097656-0.0625-0.1875-0.10547-0.27344-0.046875-0.085938-0.10156-0.16406-0.16016-0.23828-0.066406-0.085937-0.14062-0.16016-0.22266-0.23047-0.035157-0.03125-0.054688-0.070313-0.097657-0.097656l-11.852-8.1445c-0.70703-0.48438-1.6836-0.30859-2.1719 0.40234s-0.30859 1.6836 0.40234 2.1719l8.1094 5.5703c-20.578 2.3047-36.621 19.781-36.621 40.957z" />
        <path d="m80.703 7.1953-6.043 6.043c-0.003906 0.003907-0.007812 0.003907-0.011718 0.007813-0.003907 0.003906-0.003907 0.007812-0.007813 0.011718l-3.5625 3.5625c-0.003906 0.003907-0.003906 0.003907-0.007813 0.003907-0.003906 0.003906-0.003906 0.003906-0.003906 0.007812l-30.285 30.281c-0.63281 0.63281-1.1836 1.332-1.7344 2.0273-0.035156 0.027344-0.078125 0.039063-0.10938 0.074219-0.074219 0.074218-0.10938 0.16406-0.16406 0.24609-0.85938 1.1211-1.6484 2.293-2.3008 3.5508l-8.1328 15.746c-0.43359 0.83984-0.27344 1.8477 0.39062 2.5156 0.41406 0.41406 0.96484 0.63281 1.5195 0.63281 0.33984 0 0.67578-0.078125 0.99219-0.24219l15.746-8.1328c1.3047-0.67578 2.5117-1.5 3.6641-2.3945 0.039062-0.03125 0.085937-0.046875 0.12109-0.082031 0.015624-0.015626 0.019531-0.039063 0.035156-0.054688 0.71484-0.56641 1.4297-1.1328 2.0742-1.7773l30.266-30.266c0.007812-0.007812 0.019531-0.011719 0.027343-0.019531 0.007813-0.007812 0.011719-0.019531 0.019531-0.027344l3.5391-3.5391c0.007813-0.007813 0.015625-0.007813 0.023437-0.015625 0.007813-0.007813 0.007813-0.015625 0.015626-0.023438l6.0352-6.0352c3.3359-3.3359 3.3359-8.7656 0-12.102-3.2305-3.2344-8.875-3.2344-12.102 0zm1.3633 18.426-7.6836-7.6836 1.3711-1.3711 7.6836 7.6836zm-36.516 35.137-13.043 6.7383 6.7383-13.043c0.30078-0.58594 0.67969-1.1211 1.0352-1.6719l6.9453 6.9453c-0.55078 0.35547-1.0898 0.73438-1.6758 1.0352zm5.1211-3.7422c-0.29297 0.29297-0.62891 0.52734-0.93359 0.80078l-7.5508-7.5508c0.27344-0.30859 0.50781-0.64453 0.80078-0.9375l29.184-29.184 7.6836 7.6836-29.184 29.184zm39.926-39.926-4.9492 4.9492-7.6836-7.6836 4.9492-4.9492c1.0234-1.0273 2.3906-1.5898 3.8438-1.5898 1.4531 0 2.8164 0.56641 3.8438 1.5898 2.1172 2.1211 2.1172 5.5664 0 7.6836z" />
      </svg>
    );
  }
  if (kind === "withdraw") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} viewBox="0 0 24 24">
        <path d="M8.4 5.4 3.5 10.3l4.9 4.9" />
        <path d="M4 10.3h10.3c4 0 7.1 2.8 7.1 6.2 0 3.2-2.9 5.6-6.8 5.6h-4.2" />
      </svg>
    );
  }
  if (kind === "check") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} viewBox="0 0 24 24">
        <path d="m5 12.5 4.2 4.2L19 7" />
      </svg>
    );
  }
  if (kind === "double-check") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.35} viewBox="0 0 24 24">
        <path d="m3.5 12.8 3.9 4.1L15.5 6.7" />
        <path d="m9.1 12.9 3.7 4L20.8 6.8" />
      </svg>
    );
  }
  if (kind === "approve") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <path d="M12 3.5 18.5 6v5.1c0 4.2-2.6 7.6-6.5 9.4-3.9-1.8-6.5-5.2-6.5-9.4V6z" />
        <path d="m8.8 12.1 2.2 2.3 4.7-5" />
      </svg>
    );
  }
  if (kind === "reject") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <path d="M12 3.5 18.5 6v5.1c0 4.2-2.6 7.6-6.5 9.4-3.9-1.8-6.5-5.2-6.5-9.4V6z" />
        <path d="m8.7 8.7 6.6 6.6" />
        <path d="m15.3 8.7-6.6 6.6" />
      </svg>
    );
  }
  if (kind === "verified") {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
        <path d="M11.5283 1.5999C11.7686 1.29437 12.2314 1.29437 12.4717 1.5999L14.2805 3.90051C14.4309 4.09173 14.6818 4.17325 14.9158 4.10693L17.7314 3.3089C18.1054 3.20292 18.4799 3.475 18.4946 3.86338L18.6057 6.78783C18.615 7.03089 18.77 7.24433 18.9984 7.32823L21.7453 8.33761C22.1101 8.47166 22.2532 8.91189 22.0368 9.23478L20.4078 11.666C20.2724 11.8681 20.2724 12.1319 20.4078 12.334L22.0368 14.7652C22.2532 15.0881 22.1101 15.5283 21.7453 15.6624L18.9984 16.6718C18.77 16.7557 18.615 16.9691 18.6057 17.2122L18.4946 20.1366C18.4799 20.525 18.1054 20.7971 17.7314 20.6911L14.9158 19.8931C14.6818 19.8267 14.4309 19.9083 14.2805 20.0995L12.4717 22.4001C12.2314 22.7056 11.7686 22.7056 11.5283 22.4001L9.71949 20.0995C9.56915 19.9083 9.31823 19.8267 9.08421 19.8931L6.26856 20.6911C5.89463 20.7971 5.52014 20.525 5.50539 20.1366L5.39427 17.2122C5.38503 16.9691 5.22996 16.7557 5.00164 16.6718L2.25467 15.6624C1.88986 15.5283 1.74682 15.0881 1.96317 14.7652L3.59221 12.334C3.72761 12.1319 3.72761 11.8681 3.59221 11.666L1.96317 9.23478C1.74682 8.91189 1.88986 8.47166 2.25467 8.33761L5.00165 7.32823C5.22996 7.24433 5.38503 7.03089 5.39427 6.78783L5.50539 3.86338C5.52014 3.475 5.89463 3.20292 6.26857 3.3089L9.08421 4.10693C9.31823 4.17325 9.56915 4.09173 9.71949 3.90051L11.5283 1.5999Z" stroke="currentColor" strokeWidth={1.5} />
        <path d="M9 12L11 14L15 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      </svg>
    );
  }
  if (kind === "cancel") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M6 6l12 12" />
      </svg>
    );
  }
  if (kind === "x") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} viewBox="0 0 24 24">
        <path d="M6.5 6.5 17.5 17.5" />
        <path d="M17.5 6.5 6.5 17.5" />
      </svg>
    );
  }
  if (kind === "copy") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    );
  }
  if (kind === "save") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    );
  }
  if (kind === "delete" || kind === "delete-bin") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6M5 6l1 14h12l1-14" />
      </svg>
    );
  }
  if (kind === "delete-minus") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M5 12h14" />
      </svg>
    );
  }
  if (kind === "view") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  if (kind === "eye-off") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  if (kind === "back") return <ArrowLeft aria-hidden="true" className={className} strokeWidth={2} />;
  if (kind === "search") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    );
  }
  if (kind === "filter") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    );
  }
  if (kind === "refresh") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" viewBox="8 8 34 34">
        <path d="M25 38c-7.2 0-13-5.8-13-13 0-3.2 1.2-6.2 3.3-8.6l1.5 1.3C15 19.7 14 22.3 14 25c0 6.1 4.9 11 11 11 1.6 0 3.1-.3 4.6-1l.8 1.8c-1.7.8-3.5 1.2-5.4 1.2z" />
        <path d="M34.7 33.7l-1.5-1.3c1.8-2 2.8-4.6 2.8-7.3 0-6.1-4.9-11-11-11-1.6 0-3.1.3-4.6 1l-.8-1.8c1.7-.8 3.5-1.2 5.4-1.2 7.2 0 13 5.8 13 13 0 3.1-1.2 6.2-3.3 8.6z" />
        <path d="M18 24h-2v-6h-6v-2h8z" />
        <path d="M40 34h-8v-8h2v6h6z" />
      </svg>
    );
  }
  if (kind === "reset") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 32 32">
        <path d="M18,28A12,12,0,1,0,6,16v6.2L2.4,18.6,1,20l6,6,6-6-1.4-1.4L8,22.2V16H8A10,10,0,1,1,18,26Z" />
      </svg>
    );
  }
  if (kind === "restore") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth={0.45} viewBox="0 0 36 36">
        <rect x="6" y="22" width="24" height="2" />
        <rect x="26" y="26" width="4" height="2" />
        <path d="M13,9.92,17,6V19a1,1,0,1,0,2,0V6l4,3.95A1,1,0,1,0,24.38,8.5L18,2.16,11.61,8.5A1,1,0,0,0,13,9.92Z" />
        <path d="M30.84,13.37A1.94,1.94,0,0,0,28.93,12H21v2h7.95C30,16.94,31.72,21.65,32,22.48V30H4V22.48C4.28,21.65,7.05,14,7.05,14H15V12H7.07a1.92,1.92,0,0,0-1.9,1.32C2,22,2,22.1,2,22.33V30a2,2,0,0,0,2,2H32a2,2,0,0,0,2-2V22.33C34,22.1,34,22,30.84,13.37Z" />
      </svg>
    );
  }
  if (kind === "link") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
      </svg>
    );
  }
  if (kind === "unlink") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M4 4l16 16" />
      </svg>
    );
  }
  if (kind === "share") {
    return (
      <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" d="M21 11v9c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-9h2v9h14v-9h2ZM13 5.4V16h-2V5.4L7.7 8.7 6.3 7.3 12 1.6l5.7 5.7-1.4 1.4L13 5.4Z" />
      </svg>
    );
  }
  if (kind === "settings") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" />
      </svg>
    );
  }
  if (kind === "generate") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} viewBox="0 0 24 24">
        <path d="M14.5 4.5 13 8l-3.5 1.5L13 11l1.5 3.5L16 11l3.5-1.5L16 8z" />
        <path d="M6.5 13.5 5.7 15.3 4 16l1.7.7.8 1.8.8-1.8L9 16l-1.7-.7z" />
        <path d="M7.5 3.5 7 4.7 5.8 5.2 7 5.7l.5 1.2.5-1.2 1.2-.5L8 4.7z" />
      </svg>
    );
  }
  if (kind === "reclass") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.7} viewBox="0 0 24 24">
        <path d="M21 16.0399H17.7707C15.8164 16.0399 13.9845 14.9697 12.8611 13.1716L10.7973 9.86831C9.67384 8.07022 7.84196 7 5.88762 7L3 7" />
        <path d="M21 7H17.7707C15.8164 7 13.9845 8.18388 12.8611 10.1729L10.7973 13.8271C9.67384 15.8161 7.84196 17 5.88762 17L3 17" />
        <path d="M19 4L22 7L19 10" />
        <path d="M19 13L22 16L19 19" />
      </svg>
    );
  }
  if (kind === "print") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <path d="M7 8V3h10v5" />
        <path d="M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7z" />
        <path d="M17 11h.01" />
      </svg>
    );
  }
  if (kind === "lock") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        <path d="M12 14v2" />
      </svg>
    );
  }
  if (kind === "unlock") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 7.6-1.7" />
        <path d="M12 14v2" />
      </svg>
    );
  }
  if (kind === "sort") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} viewBox="0 0 24 24">
        <path d="M8 4v16" />
        <path d="m5 7 3-3 3 3" />
        <path d="M16 20V4" />
        <path d="m13 17 3 3 3-3" />
      </svg>
    );
  }
  if (kind === "more") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
      </svg>
    );
  }
  if (kind === "download") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    );
  }
  if (kind === "upload") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    );
  }
  if (kind === "archive") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M21 8v13H3V8" />
        <path d="M1 3h22v5H1z" />
        <path d="M10 12h4" />
      </svg>
    );
  }
  if (kind === "list") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }
  if (kind === "history") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} viewBox="0 0 24 24">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (kind === "assistant") return <BotMessageSquare aria-hidden="true" className={className} strokeWidth={1.9} />;
  if (kind === "tree-expand") return <ChevronRight aria-hidden="true" className={className} strokeWidth={2} />;
  if (kind === "tree-collapse") return <ChevronDown aria-hidden="true" className={className} strokeWidth={2} />;
  if (kind === "panel-open") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        <path d="m14 9 3 3-3 3" />
      </svg>
    );
  }
  if (kind === "panel-close") {
    return (
      <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        <path d="m17 9-3 3 3 3" />
      </svg>
    );
  }
  return null;
}
