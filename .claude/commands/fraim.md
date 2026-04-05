The user wants to run FRAIM. The requested job or topic is: $ARGUMENTS

Follow this process:

1. **If no argument was given** (the line above ends with ": "): scan all stub files under `fraim/ai-employee/jobs/` and `fraim/ai-manager/jobs/`. List each by filename and its Intent line. Ask the user which job they want to run, then proceed to step 2.

2. **Find the job**: search `fraim/ai-employee/jobs/` and `fraim/ai-manager/jobs/` for a stub whose filename (without `.md`) matches or closely resembles the argument. Read the stub's Intent/Outcome to confirm it matches what the user wants.

3. **Load the full job**: call `get_fraim_job({ job: "<matched-job-name>" })` — never execute from stub content.

4. **Execute**: follow the phased instructions returned by `get_fraim_job`, using `seekMentoring` at phase transitions where indicated.
