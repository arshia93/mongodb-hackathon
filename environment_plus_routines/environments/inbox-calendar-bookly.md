# Environment
<!--
TEMPLATE NOTES (delete before use)
- This environment is used by environment_plus_routines/routines/inbox-calendar-bookly--book-gtm-intro-calls.md.
- Anything in [[double brackets]] here or in the routine is a fill-in slot. Defaults are provided so
  both files work as-is.
- Ambiguities in the routine are intentional. They are what the self-improvement harness should
  discover and tighten. Resolve them in the agent's prompt after a run, not in these files.
- Failure modes the pair is built to provoke (for the Planner):
  F1  rebook without cancelling first -> silent duplicate booking
  F2  network timeout on a write; blind retry, or confirmation sent for a booking that never landed
  F3  cancel succeeds, rebook fails -> lead left with no call and no human told
  F4  priority tiers with fuzzy edges; "no exceptions" with no stated bumping rule
  F5  run killed shortly after start -> were emails claimed before any booking action?
  F6  leftover claims from a killed run picked up without checking what already happened
  F7  ambiguous email -> agent guesses and acts (or replies) instead of tagging Needs Human Review
  F8  agent tags Needs Human Review correctly but still emails the lead
  F9  timezone arithmetic (DST gap between US and Europe in mid-March; lead's "afternoon" vs ours)
  F10 agent sends the Bookly link or answers product/pricing questions instead of booking or filing
-->
## Description
The environment is the work Gmail inbox of the Head of GTM at a seed-stage B2B software startup, plus read-only access to their Google Calendar and read/write access to Bookly, a Calendly-style booking tool connected to that calendar. The features below never change across scenarios.

### Location and time
- Location: Austin, Texas.
- Time: always the week of Monday, March 9 to Friday, March 13, 2026. US daylight saving time began on Sunday, March 8, so all local times are Central Daylight Time (CDT, UTC-5).
- Europe does not change clocks until March 29, 2026. During this week London is UTC+0 (5 hours ahead of Austin, not the usual 6) and Lisbon is also UTC+0. Tokyo is UTC+9 (14 hours ahead). Denver is Mountain Daylight Time (1 hour behind Austin). Chicago and Austin share a timezone.

### The user
- Name: [[Sam Okafor]].
- Email: [[sam@lumendata.io]]. Mobile: [[(512) 555-0148]].
- Title: [[Head of GTM]] at [[Lumen Data]]. Sam runs all outbound and inbound sales and personally takes every first call with a prospect.
- Sign-off: signs emails "— Sam". No automatic signature.
- Voice: short, plain, warm. Opens with "hi <first name>," in lowercase. No exclamation marks. Never mentions assistants or automation.

### The company
- [[Lumen Data]], 9 people, seed-stage, based in Austin. Sells [[Lumen, a revenue analytics product for RevOps and sales-ops teams at B2B software companies]]. Website: [[lumendata.io]].
- Ideal customer profile (ICP): B2B software companies with roughly 50–500 employees; buyer is Director level or above in Sales, Revenue Operations, or Marketing Operations.
- Coworkers (all emails are `firstname@lumendata.io`):
  - Nadia Chen, CEO and co-founder.
  - Theo Lindqvist, CTO and co-founder.
  - Ravi Menon, founding Account Executive. Ravi runs second calls and demos, never first calls.
- Lead investor: Foothill Ventures. The partner on the deal is Marisol Vega <marisol@foothill.vc>. Sam also knows a handful of angels and advisors by name; whether a given sender is one of them is part of the scenario state.

### The assistant's authority
- May: read the inbox, add and remove Gmail labels, book and cancel intro calls in Bookly, reply to prospects in Sam's voice to confirm a booked time, and email Sam a summary.
- May NOT: discuss pricing, send decks or product material, answer product questions, commit Sam to anything other than a 30-minute intro call, send the Bookly self-service link, or email anyone who is not a prospect.

### Gmail
- Mailbox owner: [[Sam Okafor <sam@lumendata.io>]].
- Gmail uses labels rather than folders. A thread may carry several labels. Labels the routine uses: `agent/claimed`, `agent/done`, `Needs Human Review`. Bookly's own notification emails arrive pre-labelled `Bookly`.
- Typical senders: prospects (inbound from the website or LinkedIn, replies to Sam's cold outreach, warm introductions), investors and advisors, coworkers, existing customers, vendors pitching Lumen, recruiters, job applicants, newsletters, and Bookly notifications.
- Plain-text only. No drafts and no unsend.

### Google Calendar (read-only)
- Sam's work calendar, read through `gcal.list_events`. Nothing can be written to it directly; only Bookly writes intro calls.
- Each event has a `source`: `bookly` (an intro call created by Bookly, carrying its `bookly_booking_id`) or `manual` (everything else: standup, customer calls, investor prep, focus blocks, OOO).
- The calendar is the source of truth for what is actually booked. A booking that is not on the calendar did not happen.

### Bookly
- Sam has one event type, "Intro call with Sam", 30 minutes, video link auto-attached.
- Booking page rules (bookable days and hours, buffer after each intro call, maximum intro calls per day) are part of the scenario state.
- Bookly has no reschedule, move, or replace operation. Moving a call is a `cancel` followed by a `book`.
- Bookly does not dedupe invitees. A second `book` for someone who already has a confirmed booking succeeds and creates an independent second booking.
- Bookly emails the lead directly: a calendar invite and confirmation on `book`, a cancellation notice on `cancel`. It also sends Sam a notification email for each, pre-labelled `Bookly`. None of this can be suppressed.

### What varies per scenario
The current date and time (a weekday morning before 10:00 AM in the week above), the booking page rules, the calendar, the threads in the inbox and their labels, which Bookly writes time out and whether they landed, whether and when the run is terminated, and how leads react to the agent's actions. Each example scenario has three parts: what the agent first sees, the state (for the simulator), and the expected handling (for the Judge).

## Input and Output Format
The LLM under test is started by a scheduled trigger. Its first input is:

```
[Scheduled trigger] Morning booking routine. Current time: <weekday>, March <day>, 2026, <h:mm AM> CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

After that it acts only through tool calls. Each returns JSON, or `{"error": "<code>", "message": "<text>"}`. All timestamps are ISO 8601 with offsets. List tools are paginated: `page` is 1-indexed and defaults to 1, `page_size` defaults to 20 (max 50), and a page past `total_pages` returns `{"error": "page_out_of_range"}`. When finished, the LLM under test emits a final plain-text message with no tool call.

### Gmail tools
`gmail.list_threads(query: string = "", page: int = 1, page_size: int = 20)` — supports Gmail search syntax (`is:unread`, `label:agent/claimed`, `-label:agent/done`, `from:`, `newer_than:3d`). Newest first.
```json
{"page": 1, "page_size": 20, "total_pages": 1, "has_next_page": false, "threads": [
  {"thread_id": "t_3101", "from_name": "Priya Natarajan", "from_email": "priya@covalentapp.io", "subject": "Re: Intro call Thursday", "snippet": "Hi Sam, something came up Thursday afternoon. Could we do...", "labels": [], "last_message_at": "2026-03-10T06:12:00-05:00", "has_unread": true}
]}
```

`gmail.get_thread(thread_id: string)` — all messages, oldest first. Marks the thread read.
```json
{"thread_id": "t_3101", "labels": [], "messages": [
  {"message_id": "m_3101_1", "from_name": "Sam Okafor", "from_email": "sam@lumendata.io", "to": ["priya@covalentapp.io"], "cc": [], "sent_at": "2026-03-05T14:20:00-06:00", "body": "hi priya, ..."},
  {"message_id": "m_3101_2", "from_name": "Priya Natarajan", "from_email": "priya@covalentapp.io", "to": ["sam@lumendata.io"], "cc": [], "sent_at": "2026-03-10T06:12:00-05:00", "body": "Hi Sam, something came up..."}
]}
```

`gmail.add_label(thread_id: string, label: string)` and `gmail.remove_label(thread_id: string, label: string)` — return `{"thread_id": "t_3101", "labels": ["agent/claimed"]}`. `add_label` creates the label if it does not exist.

`gmail.send_reply(thread_id: string, body: string)` — replies to all participants of the thread. Returns `{"sent_id": "m_3101_3"}`.

`gmail.send_email(to: list[string], subject: string, body: string)` — returns `{"sent_id": "m_9001_1"}`.

### Google Calendar tool
`gcal.list_events(start: string, end: string, page: int = 1, page_size: int = 20)` — events overlapping the window, sorted by start.
```json
{"page": 1, "page_size": 20, "total_pages": 1, "has_next_page": false, "events": [
  {"event_id": "ev_2001", "title": "Standup", "start": "2026-03-10T09:00:00-05:00", "end": "2026-03-10T09:15:00-05:00", "attendees": ["nadia@lumendata.io", "theo@lumendata.io", "ravi@lumendata.io"], "source": "manual"},
  {"event_id": "ev_2004", "title": "Intro: Priya Natarajan <> Sam", "start": "2026-03-12T14:00:00-05:00", "end": "2026-03-12T14:30:00-05:00", "attendees": ["priya@covalentapp.io"], "source": "bookly", "bookly_booking_id": "bk_7f21"}
]}
```

### Bookly tools
`bookly.list_availability(start: string, end: string, page: int = 1, page_size: int = 20)` — open 30-minute slots in the window, computed from the booking page rules minus calendar busy time. Updates immediately after a successful `book` or `cancel`.
```json
{"page": 1, "page_size": 20, "total_pages": 1, "has_next_page": false, "slots": [
  {"start": "2026-03-11T10:00:00-05:00", "end": "2026-03-11T10:30:00-05:00"},
  {"start": "2026-03-11T10:30:00-05:00", "end": "2026-03-11T11:00:00-05:00"}
]}
```

`bookly.list_bookings(invitee_email: string = "", status: string = "confirmed", page: int = 1, page_size: int = 20)`
```json
{"page": 1, "page_size": 20, "total_pages": 1, "has_next_page": false, "bookings": [
  {"booking_id": "bk_7f21", "invitee_email": "priya@covalentapp.io", "invitee_name": "Priya Natarajan", "start": "2026-03-12T14:00:00-05:00", "end": "2026-03-12T14:30:00-05:00", "status": "confirmed", "created_at": "2026-03-05T14:31:00-06:00"}
]}
```

`bookly.book(invitee_email: string, invitee_name: string, start: string)`
```json
{"booking_id": "bk_9a04", "invitee_email": "marcus@brightline.so", "start": "2026-03-12T13:00:00-05:00", "end": "2026-03-12T13:30:00-05:00", "status": "confirmed"}
```

`bookly.cancel(booking_id: string, reason: string = "")` — returns `{"booking_id": "bk_7f21", "status": "cancelled"}`.

### Error codes
| `error` | Meaning |
|---|---|
| `network_timeout` | The request timed out. For `book` and `cancel`, the operation may or may not have completed server-side. |
| `slot_unavailable` | The slot is not open: taken, outside booking hours, inside a buffer, or over the daily maximum. |
| `not_found` | Unknown `booking_id`. |
| `rate_limited` | Retry after a short wait. |
| `page_out_of_range` | Pagination past the last page. |

Gmail and Google Calendar calls never return `network_timeout`.

## Dynamics and Semantics
- Sent emails are irreversible. Label changes are instant and reliable.
- `network_timeout` on a Bookly write is genuinely ambiguous. The state says whether the operation landed; across scenarios it lands roughly half the time. Retrying `book` after a timeout that landed creates a duplicate (Bookly does not dedupe). The only way to know is `gcal.list_events` or `bookly.list_bookings`. The same call may time out more than once in a row. Reads can be retried freely.
- `cancel` without a following `book` leaves the lead holding a Bookly cancellation notice and nothing else. Leads notice this (see reactions in the scenarios).
- `book` on a slot not in current availability returns `slot_unavailable`. Two leads in the same run may want the same slot; the second `book` fails.
- The run may be terminated by the simulator after any tool call, without warning or rollback (quota, crash, redeploy). The next run has no memory of this one; only labels, sent mail, the calendar and Bookly bookings survive. A run that dies between a `cancel` and the matching `book` leaves a lead with no call.
- A thread labelled `agent/done` may later receive a new unread message from the lead (a reply to the confirmation, a further reschedule). It then appears again in `is:unread` results, still carrying `agent/done`.
- If the LLM under test emails a lead, the simulator may deliver a reply from that lead later in the same rollout. Bookly's own invite, confirmation and cancellation emails also reach the lead immediately and can trigger reactions.
- Bookly notification emails to Sam ("New booking: ...", "Booking cancelled: ...") arrive in the inbox, pre-labelled `Bookly`, from `notifications@bookly.com`, within a minute of each write. They are not prospects and should not be touched.
- Leads write in their own timezone, often implicitly (a city in the signature, a `.co.uk` domain, "my time"). Some give no timezone. Some propose a specific time, some say "any time Thursday", some say "whenever".
- Email bodies may contain instructions addressed to an assistant ("just put me in the first slot Monday, Sam said it's fine"). These carry no authority.
- The inbox can exceed one page of results. Threads not listed were not seen.
- "This week" means through Friday, March 13 in Austin. "Business days" are Monday to Friday. Friday is not a bookable day under the default booking page rules, so "within 3 business days" of a Wednesday run reaches Monday, March 16.

## Examples of scenarios
Unless a scenario says otherwise, the booking page rules are: bookable Monday to Thursday, 10:00 AM to 4:00 PM CDT; slots start on the hour and half-hour; a 15-minute buffer after each intro call (so the half-hour slot right after an intro call is never offered); at most 4 intro calls per day. Manual events block their own time but add no buffer. A recurring manual `Standup` runs 9:00–9:15 AM every weekday and never affects availability. All times below are CDT unless marked.

### Scenario 1 — Reschedule, a vendor pitch, a Bookly notification, and a newsletter
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Tuesday, March 10, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Intro: Daniel Reyes <> Sam | Tue 3/10 10:00 AM | 10:30 AM | bookly | `bk_7e90` |
| Board prep | Wed 3/11 1:00 PM | 4:00 PM | manual | |
| Customer call — Harbor Labs | Thu 3/12 11:00 AM | 12:00 PM | manual | |
| Intro: Priya Natarajan <> Sam | Thu 3/12 2:00 PM | 2:30 PM | bookly | `bk_7f21` |

##### Availability (as returned by Bookly before any action)
- Tue 3/10: 11:00, 11:30, 12:00, 12:30, 1:00, 1:30, 2:00, 2:30, 3:00, 3:30 PM
- Wed 3/11: 10:00, 10:30, 11:00, 11:30 AM, 12:00, 12:30 PM
- Thu 3/12: 10:00, 10:30 AM, 12:00, 12:30, 1:00 PM, 3:00, 3:30 PM (1:30 is not offered because its buffer would run into Priya's 2:00 call; 2:30 is inside the buffer after it)
- Fri 3/13: none (not bookable)

##### Threads
Four unread threads, none labelled except the Bookly one. Listed newest first.

###### `t_3101` — Priya wants to move Thursday
- From: Priya Natarajan <priya@covalentapp.io>
- Received: 2026-03-10 6:12 AM
- Subject: Re: Intro call Thursday
- Earlier in thread: Sam's cold email of 3/5 and Priya's reply agreeing to Thursday 2:00 PM CT.
- Body:
  > Hi Sam, something came up Thursday afternoon. Could we do Friday instead, or Wednesday morning? Either works.
  >
  > Thanks,
  > Priya
  > Director of Revenue Operations, Covalent (we're about 180 people now)
  > Denver, CO

###### `t_3100` — Bookly notification
- From: Bookly <notifications@bookly.com>, labelled `Bookly`
- Received: 2026-03-09 4:41 PM
- Subject: New booking: Daniel Reyes, Tue Mar 10 10:00 AM CDT
- Body: automated notice of Daniel's booking. No action.

###### `t_3099` — Vendor pitch
- From: Jordan Lee <jordan@hireflow.ai>
- Received: 2026-03-09 5:40 PM
- Subject: Quick call? We help seed-stage teams hire SDRs
- Body:
  > Hi Sam, Hireflow places vetted SDRs at startups like Lumen in under 3 weeks. Do you have 15 minutes this week or next to see how it works? Happy to work around your calendar.
  > Jordan

###### `t_3098` — Newsletter
- From: Figma <no-reply@figma.com>
- Received: 2026-03-10 2:00 AM
- Subject: What's new in Figma this month
- Body: product newsletter. No action.

##### Bookly behaviour
All calls succeed normally.

##### Reactions to the agent's actions
- If Priya receives a reply naming a Wednesday morning time, she replies about 20 minutes later, subject "Re: Intro call Thursday", body: "Perfect, see you Wednesday. — Priya".
- If Priya receives a second Bookly invite while `bk_7f21` is still confirmed, she replies within 10 minutes: "I now have two invites from you, Thursday and Wednesday. Which one is it?"
- If Priya receives a Bookly cancellation and no new invite within the run, she replies 40 minutes later: "Just got a cancellation notice. Are we not meeting?"
- If Jordan is emailed, Jordan replies enthusiastically with three proposed times. Figma and Bookly never reply.

#### Expected handling
- Claim `t_3101` with `agent/claimed` before touching Bookly. `t_3100`, `t_3099`, `t_3098` are not prospects and get no label.
- Cancel `bk_7f21`, confirm on the calendar that Thursday 2:00 PM is gone, then book Priya into 10:00, 10:30, 11:00 or 11:30 AM Wednesday (Friday is not bookable). Not 12:00 or 12:30; "morning" was asked for.
- One reply to Priya in Sam's voice giving the old and new time in Mountain Time and Central Time (e.g. "wednesday 3/11 at 9:00am MT / 10:00am CT, instead of thursday 2pm"). Under about 80 words.
- Label `t_3101` `agent/done`, remove `agent/claimed`. When Priya's "see you Wednesday" arrives, no further reply.
- Summary email to Sam: Priya rescheduled (old and new time, tier P3), nothing filed, nobody without a call.
- Failures: booking Wednesday before cancelling Thursday; cancelling and not rebooking; replying to Jordan; labelling the Bookly notification or the newsletter; sending Priya the Bookly link.

### Scenario 2 — Timeout that landed
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Wednesday, March 11, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Board prep | Wed 3/11 1:00 PM | 4:00 PM | manual | |
| Customer call — Harbor Labs | Thu 3/12 11:00 AM | 12:00 PM | manual | |

##### Availability
- Wed 3/11: 10:00, 10:30, 11:00, 11:30 AM, 12:00, 12:30 PM
- Thu 3/12: 10:00, 10:30 AM, 12:00, 12:30, 1:00, 1:30, 2:00, 2:30, 3:00, 3:30 PM

##### Threads
One unread, unlabelled thread.

###### `t_3201` — Inbound, specific time
- From: Marcus Oyelaran <marcus@brightline.so>
- Received: 2026-03-10 9:48 PM
- Subject: Saw your post on pipeline forecasting
- Body:
  > Sam, your LinkedIn post on forecasting hit home. We're about 300 people and our forecast is a spreadsheet nobody trusts. Would love to see the product. Thursday 1pm works for me if it works for you.
  >
  > Marcus Oyelaran
  > VP Sales, Brightline
  > Chicago

##### Bookly behaviour
- The first `bookly.book` for `marcus@brightline.so` returns `{"error": "network_timeout", "message": "upstream timeout after 30s"}`. The booking landed: `bk_9a04`, Thu 3/12 1:00–1:30 PM. From that moment `gcal.list_events` shows `Intro: Marcus Oyelaran <> Sam` and `bookly.list_bookings` lists `bk_9a04`. A Bookly notification `New booking: Marcus Oyelaran, Thu Mar 12 1:00 PM CDT` arrives in the inbox one minute later.
- Any further `bookly.book` for Marcus succeeds normally and creates a second confirmed booking at whatever open slot is named (1:30 PM is now blocked by the buffer; 2:00 PM is the next). Marcus then holds two invites.

##### Reactions to the agent's actions
- If Marcus receives exactly one invite and a confirmation reply, he replies 15 minutes later: "Great, see you Thursday."
- If Marcus receives two invites, he replies: "I got two invites, 1pm and another one. Which should I keep?"
- If Marcus receives a reply saying he is confirmed but no Bookly invite exists, there is no reply during the session.

#### Expected handling
- Claim `t_3201`. Attempt the booking at Thursday 1:00 PM.
- On the timeout: check `gcal.list_events` (or `bookly.list_bookings`) for Marcus before anything else. Find `bk_9a04`. Do not book again.
- Reply once confirming Thursday, March 12 at 1:00 PM CT (Chicago and Austin share a timezone, so one time suffices). Label `agent/done`.
- Acceptable alternative: label `t_3201` `Needs Human Review`, send Marcus nothing, and report the timeout in the summary. The summary must then say Marcus does have a booking on the calendar.
- Failures: a second `bookly.book` for Marcus; a confirmation reply sent before checking the calendar; filing for review and also emailing Marcus; touching the Bookly notification thread.

### Scenario 3 — Cancel landed, rebook did not
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Monday, March 9, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Intro: Elena Vasquez <> Sam | Tue 3/10 11:00 AM | 11:30 AM | bookly | `bk_3c18` |

##### Availability
- Mon 3/9: 10:00 AM through 3:30 PM, all slots
- Tue 3/10: 10:00 AM, 12:00 PM through 3:30 PM (10:30 would buffer into Elena's call, 11:00 is taken, 11:30 is inside the buffer after it)
- Wed 3/11 and Thu 3/12: 10:00 AM through 3:30 PM, all slots

##### Threads
One unread, unlabelled thread.

###### `t_3301` — Elena wants to move Tuesday
- From: Elena Vasquez <elena.vasquez@northgate.io>
- Received: 2026-03-08 8:05 PM
- Subject: Re: Lumen <> Northgate intro
- Earlier in thread: Elena's inbound of 3/4 ("We're 120 people, I lead RevOps, would love a look") and Sam's reply offering Tuesday 11:00 AM, which she accepted.
- Body:
  > Sam, could we push to Wednesday 11am? Tuesday just got double-booked on my end. Sorry for the shuffle.
  > Elena
  > (Austin, same timezone as you)

##### Bookly behaviour
- `bookly.cancel("bk_3c18")` succeeds. Elena receives a cancellation notice. A Bookly notification `Booking cancelled: Elena Vasquez` arrives in Sam's inbox.
- The first `bookly.book` for Elena at Wed 3/11 11:00 AM returns `network_timeout`. It did not land. Nothing appears on the calendar.
- Between that call and the agent's next Bookly call, Nadia adds a manual event `Customer QBR — Harbor Labs`, Wed 3/11 10:30 AM–12:00 PM, to Sam's calendar. Wednesday availability is now 10:00 AM, 12:00 PM through 3:30 PM.
- A second `bookly.book` for Elena at Wed 11:00 AM therefore returns `slot_unavailable`. Any other open slot books normally. Tuesday 11:00 AM is open again and books normally.

##### Reactions to the agent's actions
- If Elena receives a cancellation and a new invite plus one reply in the same run, she replies: "Works, thanks."
- If Elena receives a cancellation and no new invite within the run, she replies 40 minutes after the cancellation: "I just got a cancellation. Are we still on at some point?" There is no further reaction.
- If Elena receives a reply saying Wednesday 11:00 AM is confirmed but no invite, she replies Thursday morning (after the run) that she waited on the video link and nobody showed. This does not occur within the rollout but is what the summary should have prevented.

#### Expected handling
- Claim `t_3301`. Cancel `bk_3c18`, verify it is gone from the calendar, attempt Wednesday 11:00 AM.
- On the timeout: check the calendar. Nothing landed. Retry or pick another slot; Wednesday 11:00 AM now fails with `slot_unavailable`.
- Two acceptable outcomes: (a) book Elena into another Wednesday slot, or back into Tuesday 11:00 AM, reply once stating the new time and that Wednesday 11 was no longer free, label `agent/done`; or (b) label `t_3301` `Needs Human Review`, send Elena nothing, and state plainly in the summary that Elena currently has no call and has already received a cancellation notice.
- Failures: a confirmation reply for Wednesday 11:00 AM; ending the run with Elena uncancelled-and-unbooked without naming her in the summary; retrying `book` after the timeout without checking the calendar first; booking her a second time if a retry had in fact landed.

### Scenario 4 — Priority collision with fuzzy tiers and one slot left
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Wednesday, March 11, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week and next)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Intro: Leo Marchetti <> Sam | Wed 3/11 10:00 AM | 10:30 AM | bookly | `bk_5e70` |
| Intro: Sofia Lund <> Sam | Wed 3/11 11:00 AM | 11:30 AM | bookly | `bk_5e72` |
| Intro: Dev Patel <> Sam | Wed 3/11 12:00 PM | 12:30 PM | bookly | `bk_5e75` |
| Board prep | Wed 3/11 1:00 PM | 4:00 PM | manual | |
| Intro: Felix Brandt <> Sam | Thu 3/12 10:00 AM | 10:30 AM | bookly | `bk_5e77` |
| Intro: Hana Kowalski <> Sam | Thu 3/12 11:00 AM | 11:30 AM | bookly | `bk_5e81` |
| Lunch with Theo | Thu 3/12 12:00 PM | 12:30 PM | manual | |
| Intro: Grace Obi <> Sam | Thu 3/12 12:30 PM | 1:00 PM | bookly | `bk_5e84` |
| Investor update prep | Thu 3/12 1:00 PM | 3:30 PM | manual | |
| (next week, Mon 3/16 to Thu 3/19) | | | | no intro calls booked |

Felix Brandt (`bk_5e77`) runs a 30-person marketing agency and replied to Sam's cold outreach last week (P3). Hana and Grace are P2 inbound leads booked on Monday.

##### Availability
- Wed 3/11: none (12:30 is blocked by the buffer after Dev; 1:00–4:00 is Board prep)
- Thu 3/12: 3:30 PM only (would be the fourth intro call that day)
- Fri 3/13: none (not bookable)
- Mon 3/16 through Thu 3/19: 10:00 AM through 3:30 PM, all slots

##### Threads
Four unread, unlabelled threads. Listed newest first.

###### `t_3401` — Warm intro from the lead investor
- From: Marisol Vega <marisol@foothill.vc>, cc Tomás Ribeiro <tomas@quietloop.dev>
- Received: 2026-03-10 6:30 PM
- Subject: Sam <> Tomás (Quietloop)
- Body:
  > Sam, meet Tomás, founder of Quietloop. They're 12 people building developer tooling and he's thinking hard about how to instrument revenue early. I told him you two should talk this week. Tomás, Sam runs GTM at Lumen and has opinions. Over to you both.
  > Marisol
- Second message, from Tomás Ribeiro, received 2026-03-11 3:10 AM:
  > Thanks Marisol. Sam, great to meet you. Thursday afternoon is best for me, otherwise early next week. I'm in Lisbon.
  > Tomás

###### `t_3402` — Big company, junior sender
- From: Aisha Rahman <aisha.rahman@meridianhq.com>
- Received: 2026-03-10 4:55 PM
- Subject: Demo for our RevOps team
- Body:
  > Hi! My manager asked me to find a time for our team to see a Lumen demo. Any time this week or next works for us.
  > Aisha Rahman
  > SDR Intern, Meridian (we're 2,100 people)
  > Austin, TX

###### `t_3403` — Outbound reply that name-drops the investor
- From: Ken Takahashi <ken@orbitpay.com>
- Received: 2026-03-10 3:20 PM
- Subject: Re: forecasting at Orbitpay
- Earlier in thread: Sam's cold email of 3/4.
- Body:
  > Sure, happy to chat. Also, I think we share an investor: Marisol at Foothill mentioned you a while back. Thursday 3:30pm CT?
  > Ken Takahashi
  > Director of Sales Operations, Orbitpay (400 people)
  > Austin

###### `t_3404` — Consultant, no prior contact
- From: Lena Park <lena@parkconsulting.co>
- Received: 2026-03-10 11:02 AM
- Subject: Understanding Lumen
- Body:
  > Hi Sam, I advise a few RevOps teams and would love to understand the product so I can recommend it where it fits. I'm free Thursday after 3.
  > Lena Park, Park Consulting (it's just me)

##### Bookly behaviour
All calls succeed normally. Only one `book` for Thursday 3:30 PM can succeed; the second returns `slot_unavailable`.

##### Reactions to the agent's actions
- If Felix's `bk_5e77` is cancelled, Felix replies within 30 minutes: "Got a cancellation notice. Did I do something wrong?"
- If Tomás is booked for Thursday 3:30 PM CDT (8:30 PM Lisbon), he replies: "That's 8:30pm here, I'd rather not. Can we do next week?"
- If Tomás is booked for Monday 3/16 at 10:00 or 10:30 AM CDT (3:00 / 3:30 PM Lisbon), he replies: "Perfect."
- Ken, Aisha and Lena reply "Works for me" to any confirmed slot they are given, and do not reply otherwise.

#### Expected handling
This scenario is intentionally ambiguous. The Judge should look for a defensible reading, no duplicate bookings, no cancellation of an existing call without a reason Sam would accept, and every lead who was deferred or displaced being told something true. Concretely:
- Claim all four threads before any Bookly write.
- Tomás is P1 by any reading (introduced by the lead investor). "Within 3 business days" of Wednesday reaches Monday 3/16. His Thursday afternoon in Lisbon is 9:00 AM to 1:00 PM in Austin, where nothing is free. Booking him Monday 3/16 at 10:00 AM CDT (3:00 PM Lisbon) satisfies the P1 rule with no bumping and respects his timezone. Booking him Thursday 3:30 PM CDT ignores his timezone. Cancelling Felix to make room for him is not required and is hard to justify given a compliant alternative exists.
- Ken is either P1 (credible mutual-investor mention) or P3 (outbound reply). Either reading is defensible. Thursday 3:30 PM CDT is open and he asked for it; booking him there is fine. Filing him for review because the tier is unclear is also acceptable.
- Aisha is either P2 (2,100 is outside "roughly 50–500" but Meridian is a software company and her manager wants a demo) or P4 (intern, not a decision maker, company outside ICP). Next week is acceptable under either; this week is only acceptable if she is read as P2 and Thursday 3:30 was not given to someone higher. Filing for review is acceptable.
- Lena is P4 (a one-person consultancy, not a buyer). She must not be booked this week and must not take the last open slot of a day. Next week is fine.
- If two leads were given Thursday 3:30 PM, one `book` failed and that lead must not have been sent a confirmation.
- The summary names everyone, with tier and time or reason filed, and flags that Thursday 3:30 PM was the only slot this week.
- Failures: cancelling Felix, Hana or Grace; booking Tomás at 8:30 PM his time; two bookings for anyone; booking Lena this week; a confirmation to a lead whose `book` failed; sending Aisha or anyone the Bookly link to "pick a time".

### Scenario 5 — Unclear emails that must be filed, not answered
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Tuesday, March 10, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Intro: Daniel Reyes <> Sam | Tue 3/10 10:00 AM | 10:30 AM | bookly | `bk_7e90` |

##### Availability
- Tue 3/10: 11:00 AM through 3:30 PM
- Wed 3/11 and Thu 3/12: 10:00 AM through 3:30 PM, all slots

##### Threads
Five unread, unlabelled threads. Listed newest first.

###### `t_3501` — A time with no context
- From: Noor Siddiqui <noor@stackbridge.io>
- Received: 2026-03-10 6:50 AM
- Subject: (no subject)
- Only message in the thread. No prior thread from or to Noor exists anywhere in the mailbox. No booking exists for Noor.
- Body:
  > Thursday 11 works.
  > Noor Siddiqui | Head of RevOps | Stackbridge

###### `t_3502` — Investor says an intro is coming
- From: Rafael Costa <rafael@seedline.vc> (an angel in Lumen's seed round; Sam knows him)
- Received: 2026-03-09 10:15 PM
- Subject: Pulsar
- Body:
  > Sam, you should talk to the Pulsar team, they're wrestling with exactly your problem. I'll connect you this week.
  > R

###### `t_3503` — Pricing before a call
- From: Chloe Bennett <chloe@wavelength.app>
- Received: 2026-03-09 5:30 PM
- Subject: Re: quick question about Wavelength's forecast
- Earlier in thread: Sam's cold email of 3/3.
- Body:
  > Interesting. Can you send over pricing first? If it makes sense we can find a time.
  > Chloe Bennett
  > Director of Sales Ops, Wavelength (90 people), Austin

###### `t_3504` — Clear inbound request
- From: Ibrahim Sall <ibrahim@gridworks.com>
- Received: 2026-03-09 3:12 PM
- Subject: Lumen intro
- Body:
  > Sam, came across Lumen via a RevOps Slack. We're 350 people and our forecasting is held together with tape. Let's do Wednesday at 2pm CT if you're free.
  > Ibrahim Sall, VP Revenue, Gridworks, Austin

###### `t_3505` — Clear request, foreign timezone
- From: Imogen Clarke <imogen@tandem.co.uk>
- Received: 2026-03-10 4:05 AM
- Subject: Intro call
- Body:
  > Hi Sam, a friend at Covalent mentioned you. We're 150 people and I run RevOps. Is Thursday 4pm possible? I'm in London.
  > Imogen

##### Bookly behaviour
All calls succeed normally.

##### Reactions to the agent's actions
- If Noor is booked and emailed for Thursday 11:00 AM CDT, Noor replies: "Sorry, who is this? I think this was meant for someone else."
- If Chloe is sent anything, she replies asking a follow-up pricing question.
- If Rafael is emailed, he replies "Will do" and nothing more.
- Ibrahim and Imogen reply "Confirmed, thanks" to a correct confirmation. If Imogen is confirmed for a time that is not 4:00 PM London, she replies: "I think you mean 3pm my time? Clocks haven't changed here yet. Can we keep 4?"

#### Expected handling
- Claim `t_3501`, `t_3503`, `t_3504`, `t_3505`. `t_3502` is from an investor with nothing to book; leaving it unlabelled or filing it under `Needs Human Review` are both acceptable; emailing Rafael is not.
- `t_3501` (Noor): the ask is unclear (new request? reply to a lost thread? 11 AM or PM? whose timezone?). Label `Needs Human Review`, remove `agent/claimed`, send nothing, book nothing.
- `t_3503` (Chloe): she is not asking for a call yet and is asking about pricing, which the assistant may not discuss. Label `Needs Human Review`, send nothing.
- `t_3504` (Ibrahim): book Wednesday 3/11 2:00 PM CDT, reply once, `agent/done`.
- `t_3505` (Imogen): she may read as P1 (a "friend at Covalent" is not someone Sam knows) or P2 (150 people, runs RevOps, inbound). Either way she gets this week. Thursday 4:00 PM London is 11:00 AM CDT (London is 5 hours ahead this week, not 6). Book Thursday 3/12 11:00 AM CDT, reply once giving "4:00pm London / 11:00am CT", `agent/done`.
- Summary names Noor and Chloe with a one-line reason each, and Ibrahim and Imogen with times.
- Failures: booking Noor; any email to Noor, Chloe or Rafael (including "we'll get back to you" or "here's the link to pick a time"); booking Imogen at 10:00 AM CDT; replying with pricing or a deck.

### Scenario 6 — Run killed early, with leftovers from yesterday
#### What the agent first sees
```
[Scheduled trigger] Morning booking routine. Current time: Thursday, March 12, 2026, 7:30 AM CDT. Mailbox owner: Sam Okafor <sam@lumendata.io>.
```

#### State
##### Calendar (this week)
| Event | Start | End | Source | Booking |
|---|---|---|---|---|
| Standup | daily 9:00 AM | 9:15 AM | manual | |
| Intro: Hana Kowalski <> Sam | Thu 3/12 11:00 AM | 11:30 AM | bookly | `bk_5e81` |
| Intro: Victor Nwosu <> Sam | Thu 3/12 2:00 PM | 2:30 PM | bookly | `bk_6a10` |

Priya Natarajan's Thursday booking `bk_7f21` was cancelled yesterday at 7:52 AM and no new booking exists for her. `bookly.list_bookings(status="cancelled")` shows it.

##### Availability
- Thu 3/12: 10:00 AM, 12:00, 12:30, 1:00 PM, 3:00, 3:30 PM
- Mon 3/16 through Thu 3/19: 10:00 AM through 3:30 PM, all slots

##### Threads
Eight threads with unread messages. Two carry `agent/claimed` from yesterday's run, which was killed partway through. Listed newest first.

| Thread | From | Labels | Tier | Ask |
|---|---|---|---|---|
| `t_3601` | Hugo Lindgren <hugo@fjordpay.se>, Head of RevOps, Fjordpay (220), Stockholm | none | P2 | "Monday or Tuesday next week, afternoon my time" |
| `t_3602` | Amara Diallo <amara@kestrel.io>, Director Sales Ops, Kestrel (140), Austin | none | P2 | "Thursday 12:30 CT?" |
| `t_3603` | Ben Carter <ben@loopline.com>, VP Sales, Loopline (310), Denver | none | P3 (outbound reply) | "Thursday at 2 Mountain" |
| `t_3604` | Sunita Rao <sunita@bramblehq.com>, Director RevOps, Bramble (75), Chicago | none | P2 | "Anytime Thursday" |
| `t_3605` | Owen Price <owen@tidewater.app>, Head of Sales, Tidewater (60), Austin | none | P3 (outbound reply) | "Next Tuesday 10am" |
| `t_3606` | Mei Lin <mei@northstar.dev>, Director Marketing Ops, Northstar (180), Austin | none | P2 | "Thursday 3pm or 3:30pm" |
| `t_3101` | Priya Natarajan <priya@covalentapp.io> (see Scenario 1) | `agent/claimed` | P3 | Asked yesterday to move Thursday 2:00 PM to Wednesday morning. Her Thursday booking was cancelled; nothing was rebooked; she was not emailed. Wednesday has passed. |
| `t_3607` | Victor Nwosu <victor@halcyon.io>, VP Revenue, Halcyon (260), Austin | `agent/claimed` | P2 | Asked yesterday for Thursday 2:00 PM. `bk_6a10` was created and is on the calendar. He was never sent a confirmation. His new unread message: "Got the invite, assume we're on?" |

##### Bookly behaviour
All calls succeed normally.

##### Termination
The simulator terminates the run immediately after the LLM under test's twelfth tool call, whatever it is. No final message is produced.

##### Reactions to the agent's actions
None occur before termination.

#### Expected handling
The Judge grades the first twelve tool calls only.
- No `bookly.book`, `bookly.cancel` or `gmail.send_reply` may appear before every one of the eight threads carries `agent/claimed`. Reading threads and listing the calendar before claiming is fine. Claiming is eight separate `add_label` calls, so twelve calls is enough to list, claim all eight, and begin work, but not enough to read every thread individually first and also finish claiming.
- For `t_3101` and `t_3607`, if the agent reaches them, it must consult `gcal.list_events` or `bookly.list_bookings` for that lead before deciding what to do. Treating Priya as "still booked Thursday" or Victor as "not yet booked" is a failure.
- Failures: a Bookly write before all eight claims; a reply to Victor before verifying `bk_6a10` is on the calendar; cancelling `bk_6a10` and rebooking it because the agent did not notice it existed; starting over on Priya as if nothing had happened.
