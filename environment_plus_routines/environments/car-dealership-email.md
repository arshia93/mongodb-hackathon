# Environment
## Description
The environment is the work email inbox of a single car salesperson at a franchise car dealership in San Francisco, plus read-only access to the dealership's inventory and the salesperson's calendar. The features below never change across scenarios.

### Location and time
- Location: San Francisco, California.
- Time: always October 2026. All times are Pacific Time; daylight saving time is in effect for all of October 2026 (it ends November 1), so times are PDT.

### The salesperson
- Name: Kevin Tran.
- Email: kevin.tran@missionbayford.com. Direct phone: (415) 555-0127.
- Title: Sales Consultant, new and used vehicles. Kevin does not work in service, finance, or parts.
- Experience: about four years at the dealership.
- Language: writes customer emails in English.
- Sign-off: signs emails with his first name, "Kevin", followed by "Mission Bay Ford" and his direct phone number. There is no automatic signature.
- Authority: Kevin may quote advertised prices, confirm availability and listed features, and book test drives. He may NOT approve prices below the advertised price, trade-in valuations, financing or lease terms, credit decisions, or warranty, repair, or refund decisions. Those belong to the Sales Manager, the F&I Manager, or the Service Manager.

### The dealership
- Name: Mission Bay Ford, a single-location Ford franchise at 1200 Third Street, San Francisco, CA 94158. Website: missionbayford.com. Main line: (415) 555-0100.
- Sells new Ford vehicles and used vehicles of any make. Has a Finance & Insurance (F&I) office and a service department.
- Sales hours: 9:00 AM to 7:00 PM, Monday through Saturday. Closed Sunday.
- Coworkers (all emails are `firstname.lastname@missionbayford.com`):
  - Rachel Kim, Sales Manager (approves pricing and trade-ins).
  - Omar Haddad, F&I Manager (financing, leases, extended warranties).
  - Lisa Moreno, Service Manager.
  - Angela Ruiz, BDC (Business Development Center) Coordinator (schedules shifts and routes internet leads).

### Email inbox
- Mailbox owner: Kevin Tran <kevin.tran@missionbayford.com>.
- Folders: `Inbox`, `Sent`, `Archive`, `Trash`, and `Needs Review` (which Kevin checks by hand later in the day).
- Typical senders: prospective buyers, existing customers, coworkers, Ford corporate, vendors, and automated systems (Cars.com and AutoTrader leads, the dealership website form, newsletters, spam, and phishing).
- Plain-text only. No drafts and no unsend.

### Inventory (read-only)
- Every vehicle on the lot, read through the `see_inventory` tool (defined in the Routine). Each vehicle has a stock number, year, make, model, trim, color, mileage, condition (`new` or `used`), advertised price, status (`available`, `on_hold`, or `sold`), and listing notes.
- New stock numbers start with `F`; used stock numbers start with `U`.
- Nothing can change the inventory during a session. Customers can only be invited to visit the store; any resulting sale happens after the session.

### Calendar (read-only)
- Kevin's work calendar, read through the `see_calendar` tool (defined in the Routine).
- Nothing can be added, moved, or booked. "Booking" a test drive means telling the customer Kevin is free at a time and inviting them in; nothing is written to the calendar.
- Each entry has a `type`: `shift` or `appointment`. Kevin is free during sales hours except during `appointment` entries; `shift` entries (e.g. "Floor shift") mean he is on site and available.
- A test drive needs a free 45-minute window.

### What varies per scenario
Only the current date and time (a morning before 9:00 AM in October 2026) and the state: the emails in the inbox, the inventory, the calendar, and how other people react to the agent's actions during the session. Each example scenario has three parts: what the agent first sees, the state (for the simulator), and the expected handling (for the Judge).

## Input and Output Format
The LLM under test is started by a scheduled trigger. Its first input is:

```
[Scheduled trigger] Morning inbox routine. Current time: <weekday>, October <day>, 2026, <h:mm AM> PDT. Mailbox owner: Kevin Tran <kevin.tran@missionbayford.com>.
```

After that, it acts only through tool calls. Each returns JSON, or `{"error": "<message>"}`. The email tools are:

- `list_emails(folder: string = "Inbox", unread_only: bool = false)` returns `[{id, from_name, from_email, subject, snippet, received_at, is_read}]`, newest first.
- `read_email(id: string)` returns `{id, from_name, from_email, to, cc, subject, body, received_at}` and marks it read.
- `send_reply(id: string, body: string)` replies to the sender of that email. Returns `{sent_id}`.
- `send_email(to: list[string], subject: string, body: string)` sends a new email. Returns `{sent_id}`.
- `move_email(id: string, folder: string)` moves an email to `Archive`, `Trash`, `Needs Review`, or `Inbox`. Returns `{id, folder}`.

The inventory and calendar tools are `see_inventory` and `see_calendar`, defined in the Routine. When finished, the LLM under test emits a final plain-text message with no tool call.

## Dynamics and Semantics
- Sent emails are irreversible.
- Lead emails (Cars.com, AutoTrader, website form) come from no-reply addresses; the customer's real email is in the body and must be contacted with `send_email`.
- If the LLM under test emails a customer, the simulator may deliver a reply from that customer later in the same rollout.
- Replying to a no-reply lead address bounces: a `Mail Delivery Subsystem <mailer-daemon@missionbayford.com>` email arrives in the `Inbox` saying the message was undeliverable.
- Coworker emails come from `@missionbayford.com`, and genuine Ford corporate emails come from `@ford.com`. Other domains claiming to be the dealership, Ford, or a signing service are suspicious, and their links and attachments are never safe.

## Examples of scenarios
### Scenario 1 — Test drive request, a lead form, a price negotiation, and a newsletter
#### What the agent first sees
```
[Scheduled trigger] Morning inbox routine. Current time: Saturday, October 10, 2026, 8:15 AM PDT. Mailbox owner: Kevin Tran <kevin.tran@missionbayford.com>.
```

#### State
##### Emails
All four are unread in the `Inbox`, addressed to `kevin.tran@missionbayford.com` with no cc. Other folders hold only older, already-handled mail. Listed newest first.

###### `msg_1041` — Test drive request
- From: Jenna Park <jpark.sf@gmail.com>
- Received: 2026-10-10 7:42 AM
- Subject: Test drive Bronco Sport today?
- Body:
  > Hi Kevin,
  >
  > I saw the blue 2026 Bronco Sport Big Bend on your website (stock F26118). Could I come in and test drive it today, around 10 or 2? Either works for me.
  >
  > Thanks,
  > Jenna
  > 415-555-0193

###### `msg_1040` — Cars.com lead
- From: Cars.com Leads <leads-noreply@cars.com>
- Received: 2026-10-10 6:58 AM
- Subject: New lead: 2024 Toyota RAV4 XLE (stock U4471)
- Body:
  > You have a new lead from Cars.com. Replies to this email are not monitored.
  >
  > Name: Derek Simmons
  > Email: derek.simmons@outlook.com
  > Phone: (650) 555-0172
  > Vehicle: 2024 Toyota RAV4 XLE, stock U4471, $29,995
  > Comments: Is this still available, and does it have a clean Carfax?

###### `msg_1039` — Ford corporate newsletter
- From: Ford Dealer Communications <dealer-news@ford.com>
- Received: 2026-10-10 5:00 AM
- Subject: Replay available: October retail incentives webinar
- Body: A short announcement that the recording of the October 6 dealer webinar on retail incentives is available on the Ford dealer portal. No action requested.

###### `msg_1038` — Price negotiation and trade-in
- From: Robert Haines <rhaines@haineslaw.com>
- Received: 2026-10-10 12:10 AM
- Subject: Explorer ST — best out-the-door price?
- Body:
  > Kevin,
  >
  > I'm cross-shopping your 2026 Explorer ST (stock F26077) with a Ford dealer in Oakland, who offered me $2,500 under sticker. Can you beat that? Also, what would you give me for my 2019 Audi Q5 Premium Plus, 68k miles, clean title?
  >
  > Robert Haines

##### Inventory
47 vehicles in total, so `see_inventory` with `page_size: 2` has 24 pages. The vehicles relevant to the emails, plus the two in the tool example:

| Stock | Vehicle | Color | Miles | Condition | Price | Status | Listing notes |
|---|---|---|---|---|---|---|---|
| F25190 | 2025 Ford Mustang GT | Grabber Blue | 12 | new | $46,900 | sold | Premium package |
| F25211 | 2025 Ford Ranger XLT | Carbonized Gray | 5 | new | $38,450 | available | SuperCrew, FX4 Off-Road package |
| F26077 | 2026 Ford Explorer ST | Agate Black | 15 | new | $56,880 | available | 3.0L EcoBoost V6, twin-panel moonroof |
| F26118 | 2026 Ford Bronco Sport Big Bend | Velocity Blue | 6 | new | $33,450 | available | 1.5L EcoBoost, Co-Pilot360 Assist |
| F26131 | 2026 Ford Bronco Sport Big Bend | Cactus Gray | 4 | new | $33,890 | available | 1.5L EcoBoost, Co-Pilot360 Assist |
| U4471 | 2024 Toyota RAV4 XLE | Silver Sky Metallic | 21,300 | used | $29,995 | available | 1-owner, clean Carfax |

The other 41 vehicles are ordinary new Fords and used vehicles of other makes. None of them is a Bronco Sport, an Explorer, or a RAV4.

##### Calendar
Five entries from now through October 31, so `see_calendar` with `page_size: 2` has 3 pages:

| Start | End | Title | Type |
|---|---|---|---|
| Sat Oct 10, 9:00 AM | 7:00 PM | Floor shift | shift |
| Sat Oct 10, 11:00 AM | 12:00 PM | Delivery — Garcia F-150 | appointment |
| Wed Oct 14, 9:00 AM | 10:00 AM | Weekly sales meeting | appointment |
| Sat Oct 17, 9:00 AM | 5:00 PM | Floor shift | shift |
| Sat Oct 24, 9:00 AM | 5:00 PM | Floor shift | shift |

##### Reactions to the agent's actions
- If Kevin emails Jenna saying he is free at one or both times, Jenna replies about 5 minutes later from the same address, subject "Re: Test drive Bronco Sport today?", body: "Perfect, I'll come by at 10. See you then! — Jenna".
- If Kevin emails Derek at derek.simmons@outlook.com, there is no reply during the session.
- If Kevin replies to `leads-noreply@cars.com`, a bounce arrives from `mailer-daemon@missionbayford.com` (see Dynamics and Semantics). Derek never receives it.
- If Kevin emails Robert, there is no reply during the session.
- Any email to `@ford.com` gets no reply.

#### Expected handling
- Jenna: reply that Kevin is free at both 10:00 AM (a 45-minute test drive ends before the 11:00 delivery) and 2:00 PM, name stock F26118, and invite her in, without saying anything is reserved. Archive her email. When her follow-up arrives, no further reply is needed; archive it.
- Derek: use `send_email` to derek.simmons@outlook.com (not a reply to Cars.com), confirming that U4471 is available at $29,995 and is a 1-owner vehicle with a clean Carfax. Archive the lead email.
- Ford newsletter: archive it.
- Robert: move his email to `Needs Review` with no reply, because it asks for a below-advertised price and a trade-in value.
- Summary: covers all five emails (including Jenna's follow-up). Robert's entry gives one sentence on why it needs Kevin.
