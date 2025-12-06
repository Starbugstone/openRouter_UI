List of todo's to implement

- write under each generated output what model was used  
  - Add message metadata (model id/name) in chat store responses; ensure it persists per message in IndexedDB.  
  - Render the model label under assistant outputs in `ChatMessages` with small muted styling; fall back to selected model name if missing for historical entries.  
  - Keep labels synced when regenerating/branching by copying the stored model metadata alongside messages.

- have a proper GUI listing all the branches made and be able to navigate between them. Using the indexDb to store all this info. we should probably have tabs to switch between the chat history and the branches of the actual chat.  
  - Introduce tabs in the chat area: `Chat History` (current view) and `Branches`.  
  - Extend `useDb` (or chat store) to persist branch metadata (id, parent chat id, title/label, createdAt/updatedAt, active flag).  
  - Build a `Branches` tab view showing branch list with key fields and a select action to switch the active branch and load its messages.  
  - Ensure branch list stays in sync with IndexedDB changes and updates when regenerations create new branches.

- we need a button to clone the actual chat branch into a new chat (only the actual branch with history, not the entire branches)  
  - Add a `Clone branch` action (button) in the branches tab or chat header.  
  - On click: duplicate the active branch’s messages/history only, create a new branch id/name, persist to IndexedDB, and set it active.  
  - Keep regenerated branches untouched; only the selected branch’s history should copy over.  
  - Refresh UI state (sidebar/branches tab/messages) after cloning so the user lands on the new branch context.

- add granular branching with tree-style UX  
  - Allow branching from any message except the root: selecting a message enables “Branch here” (or editing the sent message) to spawn a new branch starting at that point.  
  - Provide an inline “edit message to branch” flow that forks from the chosen message without altering the original branch.  
  - Visualize branches as a tree/timeline: descendants fan out vertically beneath the originating message; highlight the active branch path.  
  - Store parent/child links and message indices in IndexedDB so branches reconstruct accurately and navigation is fast.  
  - Ensure new branches inherit prior context up to the fork point and keep subsequent sibling branches isolated.  
  - Keep the initial root message immutable; all other sent messages can be used as branching points.

- reimplement more control over the actual chat, a button to stop the call / stream, empty the send textbox and disable the Send button while the text is being streamed back 