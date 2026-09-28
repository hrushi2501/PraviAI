# Design system

Reuse existing Tailwind v4/shadcn neutral theme, Geist typography and Lucide icons. Default and enforced appearance is light: white surfaces, slate text/borders, blue primary actions, 6px base corners, no decorative gradients or theme switch. Desktop sidebar 240px, sticky topbar, bounded content width; mobile menu reveals the same routes. Page headings 24px, body 14px, supporting text 12px. Cards have subtle borders and generous 20–24px padding; tables use compact rows with visible dividers.

Condition badges: good green, fair neutral/blue, poor amber, critical red, unknown neutral. Workflow statuses use separate labels rather than reusing condition. Warning colour always has text. Freshness appears beside observation date. No decorative health score, colour-only legend or fabricated upward trend.

Forms use persistent labels, field units and required markers, inline validation and unknown options. Dialogs use the existing accessible shadcn primitives. Tables expose search, condition/type filters, sortable headers, visibility controls, pagination, selection and explicit empty states. History is a dated actor/action/reason list. Generic fields come from versioned definitions; source data does not change on language selection.

The synthetic banner stays visible on operational preview screens; it explicitly separates temporary sample workflows from database dashboard reads. A save toast explicitly says it is a preview change. Error/empty/loading states explain next steps. Navigation translations cover seven languages; untranslated domain content remains source English, with coverage disclosed in settings.
