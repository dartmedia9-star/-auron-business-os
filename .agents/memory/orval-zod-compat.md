---
name: Orval Zod v4 Compatibility
description: Orval 8.x generates Zod v4 API calls that break Zod v3; post-processing fix baked into codegen script.
---

## Rule
After running `orval --config`, always patch the generated `lib/api-zod/src/generated/api.ts` to replace Zod v4-only methods with v3 equivalents.

## Why
Orval 8.x generates Zod v4 API (`zod.int()`, `zod.url()`, `zod.email()`, `zod.looseObject()`) but the workspace uses `zod@^3.25.76`. Zod v4 methods are only available via `import from "zod/v4"`, but Orval imports from `"zod"` (v3 root), so TypeScript throws ~30+ TS2339 errors.

## How to apply
The `lib/api-spec/package.json` codegen script now includes the sed fix automatically:
```
sed -i -e 's/zod\\.int()/zod.number()/g' \
        -e 's/zod\\.url()/zod.string()/g' \
        -e 's/zod\\.email()/zod.string()/g' \
        -e 's/zod\\.looseObject({/zod.object({/g' \
       ../../lib/api-zod/src/generated/api.ts
```
Also changed all `type: integer` → `type: number` and removed `format: email` from `lib/api-spec/openapi.yaml` to prevent Orval from generating those calls in the first place.
