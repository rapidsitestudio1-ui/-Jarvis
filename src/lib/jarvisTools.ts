/**
 * Tool definitions and persona instructions for the Realtime session.
 * Shared between the token route (session config) and the client.
 */

export const JARVIS_INSTRUCTIONS = `You are Jarvis, a voice-first AI chief of staff — calm, precise, quietly witty, with the composed confidence of a seasoned British aide. Address the user as "sir" sparingly and naturally.

Voice style:
- Speak in short, information-dense sentences. This is a spoken conversation, not an essay.
- Never read raw data structures aloud. Synthesize: "Three unread emails, one from Sarah about the launch."
- When interrupted, stop gracefully and address the new request immediately.

Operational rules:
- Use tools proactively. If the user asks about email, calendar, or notes, call the matching tool rather than guessing.
- When the user states a preference, fact about themselves, project, or favorite tool — even in passing — call "remember" to store it. Confirm briefly: "Noted."
- If a tool reports a service is not connected, offer to connect it. If the user agrees, call "connect_service".
- After initiating a connection, tell the user an authentication window is opening and to complete sign-in there.
- "What can you connect to?" → call "list_services" and summarize.
- You CAN read Notion page contents: "search_notes" finds pages (returns their ids), "read_note" retrieves a page's full content. When asked what's inside a note or to read it back, call "read_note" — never claim you cannot access page contents.
- "Prepare me for today" or any daily-briefing request → call "prepare_daily_briefing", then deliver a confident executive summary of its results.
- If asked what you know about the user, call "recall" and summarize warmly.
- To-dos live natively in this platform (not Notion). Manage them with "add_todo", "complete_todo", "update_todo", "delete_todo", and "list_todos". Be proactive: if an email or meeting clearly implies an action item, offer to add it as a to-do. When the user references a to-do loosely ("the launch thing"), call "list_todos" first to find the right title.
- Sending email: draft the message yourself from the user's intent, then read back the recipient, subject, and a one-line gist and ask for confirmation BEFORE calling "send_email". Never send without explicit verbal confirmation. If the user dictates a recipient address, repeat it back character-perfect. After sending, confirm briefly.
- The user keeps an Obsidian vault on this machine. It is their second brain and your notebook — always available, no connection required. "search_vault" finds notes, "read_vault_note" reads one in full, "create_vault_note" writes a new one, "append_vault_note" adds to an existing one, "list_vault_notes" shows what exists. This is entirely SEPARATE from Notion: "search_notes"/"read_note" are Notion, the vault tools are local.
- Be a diligent note-taker. When the user describes a client, a project, a meeting outcome, a decision, a spec, or an idea worth keeping, write it to the vault without waiting to be asked, then confirm in one line: "Filed under Clients, Acme." Prefer appending to an existing note over creating a near-duplicate — search first when unsure.
- Vault folder conventions: client work → "Clients/<Client Name>", product and startup work → "Projects/<Project Name>", meeting notes → "Meetings", raw ideas → "Ideas", daily logs → "Daily". Pass the folder when creating a note; folders are created automatically.
- Linear is the issue tracker for real client and product work: "create_linear_issue", "list_linear_issues", "update_linear_issue", "comment_on_linear_issue", "list_linear_projects". Three places hold tasks, keep them straight — "add_todo" is the user's own quick personal list, Linear is trackable work with a team and a workflow state, and the vault is for documents. If it sounds like client or product work, put it in Linear and say so.
- Starting a client website: gather the client and project details from Airtable first, read any matching skill, then call "start_website_build". It creates the folder and writes AGENTS.md — it does NOT build the site. Tell the user the folder is ready to open in their editor, where the coding agent takes over.
- Airtable is the user's structured store — client lists, pipelines, trackers: "list_airtable_bases", "describe_airtable_base", "list_airtable_records", "create_airtable_record", "update_airtable_record". Before writing a record you MUST call "describe_airtable_base" and use the exact field names it returns; Airtable rejects unknown keys, and guessing wastes the user's time. To change a row, call "list_airtable_records" first to get its id.
- "list_airtable_records" truncates long values so it stays readable. When the user wants the actual contents of a field — a drafted email, notes, a full description — call "read_airtable_record" with that row's id instead.
- Never read Airtable base, table, or record ids aloud — refer to things by name: "the Clients table in Agency OS." Summarize records rather than reciting every field.
- Never read Linear issue ids aloud. Refer to issues by their key and title: "ACM-12, the checkout bug." Before updating an issue, call "list_linear_issues" if you are not certain which one they mean, and confirm the match in one line.
- Division of labour between memory and the vault: short facts about the user ("prefers Cursor", "based in Nairobi") go to "remember". Anything with substance — notes, plans, specs, meeting records, research — goes to the vault.
- Report failures honestly and suggest the next step. Never invent data.`;

export const JARVIS_TOOLS = [
  {
    type: "function",
    name: "get_emails",
    description:
      "Fetch emails from the user's connected Gmail account. Defaults to unread messages.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query, e.g. 'is:unread', 'from:sarah', 'subject:invoice'. Default 'is:unread'.",
        },
        max_results: { type: "number", description: "Max messages to fetch (default 10)." },
      },
    },
  },
  {
    type: "function",
    name: "send_email",
    description:
      "Send an email from the user's connected Gmail account. ONLY call this after the user has verbally confirmed the recipient, subject, and message content.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string" },
        body: {
          type: "string",
          description:
            "Plain-text email body. Write it well-formed and professional unless told otherwise; sign off as the user would.",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "Optional CC addresses.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    type: "function",
    name: "get_calendar_events",
    description:
      "List events from the user's Google Calendar. Defaults to the rest of today.",
    parameters: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "ISO 8601 lower bound. Defaults to now." },
        time_max: {
          type: "string",
          description: "ISO 8601 upper bound. Defaults to end of today.",
        },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "Create a new Google Calendar event.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start_datetime: {
          type: "string",
          description:
            "Event start in ISO 8601 local time, e.g. '2026-08-05T14:00:00'. Resolve relative dates like 'tomorrow at 2 PM' yourself using the current date/time.",
        },
        duration_minutes: { type: "number", description: "Duration in minutes (default 30)." },
        description: { type: "string" },
        timezone: { type: "string", description: "IANA timezone, e.g. 'Asia/Kolkata'." },
      },
      required: ["summary", "start_datetime"],
    },
  },
  {
    type: "function",
    name: "search_notes",
    description: "Search the user's Notion workspace for pages and documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Empty string returns recent pages." },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "read_note",
    description:
      "Read the full content of a Notion page (rendered as Markdown) so you can summarize it or read it back aloud. Provide page_id if known (from search_notes results), otherwise a query to find the page by title.",
    parameters: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion page UUID, if already known." },
        query: { type: "string", description: "Page title to search for when no page_id is available." },
        title: { type: "string", description: "Display title, if known." },
      },
    },
  },
  {
    type: "function",
    name: "remember",
    description:
      "Store a fact about the user in long-term memory. Use whenever the user states a preference, project, tool choice, or personal fact.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["preference", "project", "fact", "context", "service"],
        },
        key: {
          type: "string",
          description: "Short stable identifier, e.g. 'favorite editor', 'current project'.",
        },
        value: { type: "string", description: "The fact itself, e.g. 'Cursor'." },
      },
      required: ["category", "key", "value"],
    },
  },
  {
    type: "function",
    name: "recall",
    description: "Retrieve everything Jarvis remembers about the user.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "forget",
    description: "Remove a remembered fact by its key.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    type: "function",
    name: "add_todo",
    description:
      "Add a to-do item to the user's native task list. Use when the user asks to add, track, or be reminded of something to do.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, action-oriented title." },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: {
          type: "string",
          description:
            "Optional due date/time in ISO 8601 WITH timezone offset, e.g. '2026-08-05T18:00:00+05:30'. Resolve relative phrases like 'by Friday evening' yourself using the current date/time.",
        },
        notes: { type: "string", description: "Optional extra context." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "complete_todo",
    description: "Mark a to-do as done. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "update_todo",
    description:
      "Edit an existing to-do: rename it, change priority, set or move a due date, add notes, or reopen a completed one.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Current (partial) title to match." },
        new_title: { type: "string" },
        priority: { type: "string", enum: ["high", "normal", "low"] },
        due_date: { type: "string", description: "New due date in ISO 8601." },
        notes: { type: "string" },
        reopen: { type: "boolean", description: "Set true to move a done item back to pending." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "delete_todo",
    description: "Delete a to-do entirely. Matches by (partial) title.",
    parameters: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "list_todos",
    description:
      "List the user's pending and recently completed to-dos. Use before editing when unsure of exact titles, or when the user asks what's on their plate.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "list_services",
    description:
      "List all external services Jarvis can connect to, with their current connection status.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "connect_service",
    description:
      "Begin the OAuth connection flow for an external service (Gmail, Google Calendar, Notion, or Linear). Opens an authentication window for the user.",
    parameters: {
      type: "object",
      properties: {
        service: {
          type: "string",
          description: "Service name, e.g. 'gmail', 'notion', 'google calendar', 'linear'.",
        },
      },
      required: ["service"],
    },
  },
  {
    type: "function",
    name: "create_linear_issue",
    description:
      "File a new issue in Linear. Use for bugs, tasks, and client requests that belong in the tracker rather than the personal to-do list.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, action-oriented issue title." },
        description: { type: "string", description: "Markdown body with the detail." },
        project: {
          type: "string",
          description: "Linear project name, e.g. 'Acme Website'. Matched loosely.",
        },
        team: {
          type: "string",
          description:
            "Linear team name. Omit it — if the workspace has one team it is chosen automatically.",
        },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low", "none"] },
        due_date: { type: "string", description: "Due date in ISO 8601." },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "list_linear_issues",
    description:
      "List Linear issues, optionally filtered by project or by a text query matched against title, issue key, and project. Use before updating when unsure of the exact issue.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "Restrict to one Linear project." },
        query: { type: "string", description: "Text to match against title, key, or project." },
        limit: { type: "number", description: "Max issues to scan (default 25)." },
      },
    },
  },
  {
    type: "function",
    name: "update_linear_issue",
    description:
      "Change an existing Linear issue: move its workflow state, retitle it, reprioritize, or set a due date.",
    parameters: {
      type: "object",
      properties: {
        issue: {
          type: "string",
          description: "Issue key like 'ACM-12', or part of its title. Matched loosely.",
        },
        state: {
          type: "string",
          description: "Target workflow state, e.g. 'in progress', 'done', 'backlog'.",
        },
        team: { type: "string", description: "Team name, only if the workspace has several." },
        title: { type: "string", description: "New title." },
        description: { type: "string", description: "New Markdown description." },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low", "none"] },
        due_date: { type: "string", description: "New due date in ISO 8601." },
      },
      required: ["issue"],
    },
  },
  {
    type: "function",
    name: "comment_on_linear_issue",
    description: "Add a comment to an existing Linear issue.",
    parameters: {
      type: "object",
      properties: {
        issue: { type: "string", description: "Issue key or part of its title." },
        body: { type: "string", description: "Comment text, Markdown allowed." },
      },
      required: ["issue", "body"],
    },
  },
  {
    type: "function",
    name: "list_linear_projects",
    description:
      "List the projects and teams in the user's Linear workspace. Use when they ask what's in Linear, or to confirm a project name before filing.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "list_airtable_bases",
    description:
      "List the Airtable bases the user can access. Use when they ask what's in their Airtable, or to confirm a base name.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "describe_airtable_base",
    description:
      "List the tables in an Airtable base and the field names in each. ALWAYS call this before creating or updating a record, so you use real field names rather than guessing.",
    parameters: {
      type: "object",
      properties: {
        base: {
          type: "string",
          description: "Base name. Omit it — if there is only one base it is chosen automatically.",
        },
      },
    },
  },
  {
    type: "function",
    name: "list_airtable_records",
    description:
      "Read rows from an Airtable table, optionally narrowed by a text query matched against every field value. Returns each record's id, which is required to update it.",
    parameters: {
      type: "object",
      properties: {
        base: { type: "string", description: "Base name. Matched loosely." },
        table: { type: "string", description: "Table name, e.g. 'Clients'. Matched loosely." },
        query: { type: "string", description: "Text to look for across all field values." },
        limit: { type: "number", description: "Max records to fetch (default 10, max 100)." },
      },
    },
  },
  {
    type: "function",
    name: "read_airtable_record",
    description:
      "Read one Airtable record in full, with long text fields intact. Use this when the user wants the actual contents of a field — a drafted email, notes, a description — since list_airtable_records truncates values for brevity.",
    parameters: {
      type: "object",
      properties: {
        base: { type: "string", description: "Base name." },
        table: { type: "string", description: "Table name." },
        record_id: {
          type: "string",
          description: "Airtable record id (starts with 'rec'), from list_airtable_records.",
        },
      },
      required: ["record_id"],
    },
  },
  {
    type: "function",
    name: "create_airtable_record",
    description:
      "Add a row to an Airtable table. Call describe_airtable_base first to learn the exact field names — a wrong key is rejected by Airtable.",
    parameters: {
      type: "object",
      properties: {
        base: { type: "string", description: "Base name." },
        table: { type: "string", description: "Table name." },
        fields: {
          type: "object",
          description:
            "Field name to value, e.g. {\"Name\": \"Acme Corp\", \"Status\": \"Lead\"}. Keys must match the table's real field names.",
          additionalProperties: true,
        },
      },
      required: ["fields"],
    },
  },
  {
    type: "function",
    name: "update_airtable_record",
    description:
      "Change fields on an existing Airtable row. Get record_id from list_airtable_records first. Only the fields you pass are modified.",
    parameters: {
      type: "object",
      properties: {
        base: { type: "string", description: "Base name." },
        table: { type: "string", description: "Table name." },
        record_id: {
          type: "string",
          description: "Airtable record id (starts with 'rec'), from list_airtable_records.",
        },
        fields: {
          type: "object",
          description: "Field name to new value. Only these fields change.",
          additionalProperties: true,
        },
      },
      required: ["record_id", "fields"],
    },
  },
  {
    type: "function",
    name: "start_website_build",
    description:
      "Scaffold a new client website project on disk and write the brief the coding agent reads on open. Gather the client's details from Airtable first so the brief is real, then confirm the project name before calling. Never overwrites an existing project folder.",
    parameters: {
      type: "object",
      properties: {
        client: { type: "string", description: "Client name, e.g. 'Sparkle Clean'." },
        project_name: {
          type: "string",
          description: "Folder name for the build. Defaults to the client name.",
        },
        company: { type: "string", description: "Legal or trading company name, if different." },
        website: { type: "string", description: "Existing website URL, if they have one." },
        contact: { type: "string", description: "Primary contact person." },
        email: { type: "string", description: "Contact email." },
        requirements: {
          type: "string",
          description:
            "What the site needs, in Markdown. Pull this from the Airtable project record where possible rather than inventing it.",
        },
        notes: { type: "string", description: "Anything else the coding agent should know." },
        stack: {
          type: "string",
          description: "Tech stack. Defaults to Next.js App Router + TypeScript + Tailwind.",
        },
      },
      required: ["client"],
    },
  },
  {
    type: "function",
    name: "search_vault",
    description:
      "Search the user's local Obsidian vault by title and full text. Use this before creating a note, to check whether a related one already exists.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Empty string returns recent notes." },
        max_results: { type: "number", description: "Max notes to return (default 8)." },
      },
    },
  },
  {
    type: "function",
    name: "list_vault_notes",
    description:
      "List notes in the Obsidian vault, most recently modified first. Optionally restrict to one folder, e.g. 'Clients/Acme'.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Optional vault-relative folder to list." },
        max_results: { type: "number" },
      },
    },
  },
  {
    type: "function",
    name: "read_vault_note",
    description:
      "Read the full Markdown content of one note in the Obsidian vault, so you can summarize it or read it back aloud.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative path from a search result, e.g. 'Clients/Acme/Kickoff.md'.",
        },
        title: { type: "string", description: "Note title, when the exact path isn't known." },
      },
    },
  },
  {
    type: "function",
    name: "create_vault_note",
    description:
      "Create a new Markdown note in the Obsidian vault. Use for client notes, project specs, meeting records, and ideas. Never overwrites: an existing title gets a numbered suffix.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title; becomes the filename." },
        content: {
          type: "string",
          description:
            "Note body in Markdown. Write it properly structured with headings and bullets — this is a durable document, not a transcript.",
        },
        folder: {
          type: "string",
          description:
            "Vault-relative folder, e.g. 'Clients/Acme', 'Projects/Landing Page', 'Meetings', 'Ideas'. Created if missing.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional Obsidian tags, e.g. ['client', 'proposal'].",
        },
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "append_vault_note",
    description:
      "Append a timestamped section to an existing vault note. Prefer this over creating a near-duplicate note when adding to an ongoing client log, project journal, or daily note.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path, if known." },
        title: { type: "string", description: "Note title, when the exact path isn't known." },
        content: { type: "string", description: "Markdown to append." },
        heading: {
          type: "string",
          description: "Optional section heading. Defaults to the current date and time.",
        },
      },
      required: ["content"],
    },
  },
  {
    type: "function",
    name: "prepare_daily_briefing",
    description:
      "Gather email, calendar, and notes from all connected services and compile a daily briefing. Use for 'prepare me for today', 'daily briefing', 'what's my day look like'.",
    parameters: { type: "object", properties: {} },
  },
];
