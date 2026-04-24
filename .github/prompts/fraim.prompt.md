# FRAIM

Follow this process:

1. **If the user did not specify a FRAIM job or topic**:
   Call `list_fraim_jobs()` to discover available jobs. Present the results grouped by the categories returned by the server. For each group, list 3-5 of the most relevant jobs with a one-line description.

2. **Find the match**:
   Match the user's request to a FRAIM job from `list_fraim_jobs()`. If no job matches, try a likely FRAIM skill with `get_fraim_file({ path: "skills/<likely-category>/<argument>.md" })` and confirm the match with the user.

3. **Load the full content**:
   - For jobs, call `get_fraim_job({ job: "<matched-job-name>" })`.
   - For skills, use the content returned by `get_fraim_file(...)`.

4. **Execute**:
   - For jobs, follow the phased instructions and use `seekMentoring` when the job requires phase transitions.
   - For skills, apply the skill steps directly to the user's current context.
