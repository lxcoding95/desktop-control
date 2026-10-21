# Synchronizing ChatGPT project sources

The ChatGPT Project "Remote Command Computer" should receive the standalone masterplan export named Desktop_Control_Projektquellen_Masterplan.md. This is a reference snapshot. GitHub commits and issues are the live source of operational truth.

## Initial setup

1. Upload the masterplan to the project's permanent file/source area, not just one chat message.
2. Verify a separate project chat can access the uploaded file. If not, use the canonical GitHub links.
3. New chat: read [masterplan](../master/PROJECT-MASTERPLAN.md), [continuity protocol](CHAT-CONTINUITY.md), [project snapshot](PROJECT-STATE.json) and relevant live branch/issue before changes.
4. If the old session stopped because of usage limits, resume its ID and remaining verified budget, never silently start the next session.

## Maintenance

- Preserve every significant work checkpoint as a commit on the existing work branch and an issue/PR reference.
- Update project documentation and the snapshot by reviewed PR when decisions or work status materially change.
- Refresh the uploaded project source periodically, but **never overwrite newer GitHub state from an older local snapshot**.
- Users still need to explicitly request chat continuation; project uploads and AGENTS.md cannot automatically create a fresh ChatGPT chat or restore hidden in-memory tool state.
- No paid AI agents required.
