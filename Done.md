# Done

## Overview
All TODO items have been implemented with a focus on DRY, SOLID, and KISS principles. The chat experience now tracks model metadata per response, offers branch-aware navigation with tree visualization, and provides richer control over streaming sessions.

## Detailed Changes

### Chat persistence and branching model
- **Dexie schema upgrade:** The IndexedDB wrapper now uses version 2 to persist enhanced chat records that include branch metadata, fork points, and model annotations. This ensures branch trees and message metadata survive reloads without custom migrations.
- **Chat store rewrite:** `useChat` now manages chats through branches instead of linear histories. Each branch records its parent, fork index, timestamps, and message list. Active branch selection syncs messages automatically, and persistence keeps chat titles aligned with the first user prompt.
- **Branch creation utilities:** New helpers create branches from legacy chats, clone the active branch, or fork from an arbitrary user message (with optional inline edits). Parent/child relationships are stored so the UI can rebuild trees quickly.
- **Model-aware messages:** Assistant messages attach the selected model id/name, and updates keep these labels intact during streaming. This metadata is saved to IndexedDB alongside the rest of the chat state for accurate historical display.

### API and streaming controls
- **Abortable requests:** `sendChatCompletion` accepts an abort signal, and the chat store maintains an `AbortController` per request so users can stop an in-flight stream without page reloads.
- **Streaming safeguards:** The chat UI disables sending while streaming, clears the prompt after submission, and surfaces a dedicated **Stop** control to cancel the stream mid-flight. Placeholder assistant messages are replaced with either streamed content or an explicit error message when a stream fails.

### Interface updates
- **Tab-based chat area:** The main pane now exposes "Chat History" and "Branches" tabs. The history tab retains the chat thread and input; the branches tab presents the branch tree with selection and cloning actions.
- **Branch visualization:** `BranchList` renders a tree-flattened view with indentation to convey lineage, shows fork origins and timestamps, and allows activating any branch or cloning the current one.
- **Message metadata badges:** `ChatMessages` surfaces the assistant’s model beneath each reply with muted styling and exposes a contextual "Branch here" action on non-root user messages to spawn granular forks.
- **Chat input polish:** Image previews no longer duplicate, remove buttons target the correct image payloads, and multi-line inputs keep key handling readable.

## Rationale and Impact
- **Branch-first data model** keeps histories isolated per fork, preventing regressions when experimenting with alternate replies while ensuring persistence consistency through Dexie.
- **Model metadata** provides transparency about which model generated each response, improving traceability across regenerations and cloned branches.
- **Abortable streaming** increases user control and prevents stuck UI states. Aborting leaves the current context intact without needing a refresh.
- **UI reorganization** separates concerns: history interactions remain focused on conversation flow while the branches tab centralizes navigation and management, reducing clutter and clarifying actions.
- **Code health** improvements (deduplicated previews, cleaner event handling) reduce chances of UI glitches and make future extensions—like richer branch editing—simpler to implement.
