# Performance Plan

This document tracks public access speed work for the mobile-first calendar and
list experience.

## Baseline

Measured after `npm run build` on 2026-06-13.

| Route | First-load JS, uncompressed |
| --- | ---: |
| `/` | 551,610 bytes |
| `/list` | 551,610 bytes |
| `/events/[id]` | 534,117 bytes |
| `/admin/candidates` | 532,097 bytes |

Largest static assets:

| Asset | Size |
| --- | ---: |
| `.next/static/chunks/3n7dm2ojtyzwn.js` | 222.2 KB |
| `.next/static/chunks/0cz1d0mv5g_q7.js` | 110.0 KB |
| `.next/static/chunks/0pvx_znr4qhq6.js` | 107.8 KB |
| `.next/static/chunks/14mrh2-p_w84d.js` | 53.4 KB |
| `.next/static/chunks/3rh679s50bhl7.css` | 44.7 KB |

## Bottleneck Hypotheses

1. Public routes used to share too much client-side code. Calendar, list,
   filter, and pull-to-load logic were grouped through `HomePageClient`.
2. Event detail pages are fully client-rendered because poster zoom state lives
   in the page component.
3. Admin CSS is bundled through global CSS and is therefore available to public
   routes.
4. Organizer options are queried for public page rendering without a dedicated
   server memory cache.
5. The list-window RPC can scan future occurrences more broadly than necessary
   before slicing the current window.

## Implementation Targets

1. Split public client shells into calendar-specific and list-specific clients.
2. Move event detail static content back to server components, leaving only
   poster zoom as a client island.
3. Split admin-only CSS away from public route CSS.
4. Cache organizer options with explicit invalidation after publication changes.
5. Rework the list-window RPC so the current window is bounded early and
   `has_more_events` uses a focused existence check.

## 2026-06-13 Implementation Result

Measured after `npm run build` on 2026-06-13.

| Route | Before | After | Change |
| --- | ---: | ---: | ---: |
| `/` | 551,610 bytes | 535,382 bytes | -16,228 bytes |
| `/list` | 551,610 bytes | 548,406 bytes | -3,204 bytes |
| `/events/[id]` | 534,117 bytes | 528,917 bytes | -5,200 bytes |
| `/admin/candidates` | 532,097 bytes | 532,097 bytes | 0 bytes |

Largest static assets after the refactor:

| Asset | Size |
| --- | ---: |
| `.next/static/chunks/3n7dm2ojtyzwn.js` | 222.2 KB |
| `.next/static/chunks/0cz1d0mv5g_q7.js` | 110.0 KB |
| `.next/static/chunks/0pvx_znr4qhq6.js` | 107.8 KB |
| `.next/static/chunks/14mrh2-p_w84d.js` | 53.4 KB |
| `.next/static/chunks/27jktro2p5rq9.js` | 43.4 KB |
| `.next/static/chunks/1vbax_n9zo8f5.js` | 31.7 KB |
| `.next/static/chunks/25vlqm6-j07f_.js` | 30.6 KB |
| `.next/static/chunks/1p6k9g0vym9nq.css` | 29.5 KB |
| `.next/static/chunks/2v7brzbdlrvnd.js` | 29.1 KB |
| `.next/static/chunks/0s408sqtqdyfn.css` | 15.2 KB |

Notes:

1. The root calendar route benefits most because it no longer imports list
   pull-to-load behavior through a shared home client.
2. Public CSS moved from a single 44.7 KB global chunk to a smaller public CSS
   chunk plus a separate admin CSS chunk.
3. Detail pages now ship a smaller client surface because the static layout is a
   server component and only poster zoom remains interactive.
4. The RPC change is a database-side optimization. Apply the migration before
   expecting production query behavior to change.
