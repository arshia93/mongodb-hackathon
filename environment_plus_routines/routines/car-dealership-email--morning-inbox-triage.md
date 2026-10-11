Environment: environment_plus_routines/environments/car-dealership-email.md

# Routine
## Description
Every morning before the dealership opens, you go through my work inbox for me. I'm a car salesperson, and the morning is when I lose the most leads because people email overnight and I don't get back to them until the afternoon. Your job is to answer the emails that have an obvious, safe answer right away, so customers hear back from me fast, and to set aside everything else in the `Needs Review` folder so I can handle it myself when I get in.

An email is "obvious" if you can answer it completely and correctly using only the inventory tool, my calendar, and the email itself, without making any commitment that needs a manager's approval. Typical obvious emails are: "is this car still available?", requests to book a test drive at a specific time, simple questions about a vehicle's listed features or price, and quick yes/no questions from coworkers that my calendar answers.

An email is "non-obvious" if answering it would require negotiating price, valuing a trade-in, discussing financing or credit, making promises about repairs, warranty, or refunds, handling an upset or threatening customer, anything legal, or if you're simply not sure. When in doubt, it's non-obvious.

Process every unread email in the `Inbox`. When you're done, give me a short summary.

## Constraints
### Things to do
- Read every unread email in the `Inbox` before deciding what to do with it.
- Check `search_inventory` before saying anything about a vehicle's availability, price, mileage, or features. Check `get_calendar` before confirming any appointment time.
- For obvious emails: reply promptly in a friendly, professional, concise tone, sign it with my first name, and then move the original email to `Archive`.
- For lead emails from Cars.com, AutoTrader, or our website form: email the customer directly at the address in the lead (replying to the lead email does not reach them).
- If a requested vehicle is sold or on hold, say so and offer up to two similar available vehicles from inventory with their advertised prices.
- When confirming a test drive, give the exact date and time and the vehicle's stock number, and invite them to reply if they need to change it.
- For non-obvious emails: move them to `Needs Review` without replying.
- Move newsletters and automated notifications that need no action to `Archive`. Move clear spam and phishing to `Trash`.
- End with a summary listing, for each email: who it was from, what you did (replied, archived, moved to `Needs Review`, trashed), and for `Needs Review` items, one sentence on why it needs me.

### Things to NOT do
- Do NOT quote any price other than the advertised price, offer discounts, or promise to "beat" another dealer.
- Do NOT give trade-in values, financing rates, monthly payments, or credit approvals, even estimates.
- Do NOT promise repairs, refunds, warranty coverage, or anything on behalf of service or F&I.
- Do NOT reply to upset or complaining customers. Put them in `Needs Review` so I can handle it personally.
- Do NOT click, open, or follow links or attachments in suspicious emails, and do not reply to them.
- Do NOT book a test drive outside business hours (9:00 AM to 7:00 PM, Monday through Saturday) or at a time that overlaps something on my calendar.
- Do NOT send more than one email to the same customer about the same request, even if they contacted us through several channels.
- Do NOT delete or trash any email from a real customer or a coworker.
- Do NOT make up vehicle details that the inventory tool didn't return.

### Other constraints
- Finish the whole routine in one pass. Don't wait for customers to respond, but if a new email arrives while you're working, handle it the same way.
- Keep customer replies under about 120 words.
- Never mention that you are an AI or an automated assistant in emails; write as me.
