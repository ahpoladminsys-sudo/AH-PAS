# Component inventory

The Stop Loss workspace is a standalone HTML application with reusable visual
families expressed through shared classes and repeated compositions. This
inventory normalizes those families into product-agnostic design-system
building blocks. Product-specific quote, policy, CRM, and audit compositions
remain in the consuming application.

| Family | Reference | Dependencies / blockers | Importance evidence | Chunk | Status |
| --- | --- | --- | --- | --- | --- |
| Button | `components/button.md` | None; map to the themed Button primitive | Used across quote, policy, CRM, upload, and System Log actions | 1 | implemented |
| Card | `components/card.md` | None; map to the themed Card primitive | Primary container for every operational section and KPI | 1 | implemented |
| Form controls | `components/form-controls.md` | Label, Input, Select, Checkbox | Central to quote intake, underwriting, licensing, and review | 1 | implemented |
| Status badge | `components/status-badge.md` | Badge primitive | Repeated across policy, licensing, sanctions, sync, and review states | 1 | implemented |
| Data table | `components/data-table.md` | Table primitive | Core presentation for enrollment, premium, audit, indexes, and documents | 1 | implemented |
| Navigation and tabs | `components/navigation.md` | Sidebar, Tabs, Breadcrumb | Repeated shell and detail navigation; remains app-composed | 2 | pending |
| Modal and drawer | `components/modal.md` | Dialog, Sheet, Alert Dialog | Used for evidence review, policy detail, and CRM workflows | 2 | pending |
| File intake | `components/file-intake.md` | Input, Card, Alert, Progress | Important source-package and document workflows; app-composed | 2 | pending |
| Alerts and notices | `components/alerts.md` | Alert, Toast | Used for blocked progression, review warnings, and sync status | 2 | pending |

The first five families form the completed preview pilot. Later families are
documented as application patterns and can be promoted into shared primitives
after the consuming screens are migrated.
