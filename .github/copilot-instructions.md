<!-- FRAIM_AGENT_ADAPTER_START -->
## FRAIM

- Use `fraim/` as the repository's FRAIM catalog.
- FRAIM jobs are the primary execution units and should be treated like first-class workflows.
- FRAIM skills are reusable capabilities jobs compose.
- FRAIM rules are always-on constraints and conventions.
- Repo-specific overrides and learnings live under `fraim/personalized-employee/`.
- Use the stubs to identify which job to invoke before fetching full content with FRAIM MCP tools.
- **Job stubs are for discovery only.** Never execute a job from stub content — always call `get_fraim_job({ job: "<job-name>" })` first.
<!-- FRAIM_AGENT_ADAPTER_END -->
