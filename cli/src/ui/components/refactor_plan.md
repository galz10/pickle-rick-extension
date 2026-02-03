# Refactor Plan: Clean up MultiLineInput Tests

## Overview
Remove `any` types and redundant comments from `MultiLineInput.test.ts`.

## Current State Analysis
- `mockCtx` is typed as `any`.
- Multiple casts to `any` for private property access.
- `keyEvent` is `any`.

## The Kill List
- `mockCtx: any`
- `(input as any)`
- `keyEvent: any`

## Consolidation Map
- Use a partial of `RenderContext` for `mockCtx`.
- Create an `InternalMultiLineInput` interface for private access.
- Use `KeyEvent` from `@opentui/core` for `keyEvent`.

## Changes Required:
#### cli/src/ui/components/MultiLineInput.test.ts
**Changes**: Add `InternalMultiLineInput` interface and fix types.
```typescript
interface InternalMultiLineInput {
  virtualLineCount: number;
  onContentChange: () => void;
  adjustHeight: () => void;
  emit: (event: any, ...args: any[]) => void;
  _placeholder: any;
}
```

## Verification
- [ ] `bun test cli/src/ui/components/MultiLineInput.test.ts`
