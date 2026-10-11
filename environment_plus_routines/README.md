# Environment Plus Routines
## Things you must understand
You should understand these definitions:
1. By an "environment" we mean the high-level rules of a system: its API (for agents), its semantics, and how it behaves in general. It deliberately leaves the specifics open. For example, "Google Calendar" is an environment; "Google Calendar with these specific events in it" is NOT an environment.
2. By a "state" we mean the specific details that fill in what the environment left open, so that what happens next is fully determined. In the example above, the state is the specific events on the calendar.
3. By a "scenario" we mean the tuple (environment, state). So "Google Calendar" is NOT a scenario, but "Google Calendar with these specific events in it" IS a scenario.
4. By a "routine" we mean a task description for an LLM under test (i.e. GrokBot) to behave in an environment conditioned on its state (in other words, a task description for what to do under different scenarios).


You should understand that in our stack we have various LLMs enabling this.
- The LLM under test (i.e. GrokBot) is responsible for doing the routine. It is going to do the routine on (LLM) simulated scenarios (for the purpose of ironing out issues BEFORE deploying to real environments and scenarios). The LLM simulator produces fake inputs/outputs to the LLM under test's tool calls.
- The LLM Planner takes in an environment plus routine and produces one or more scenarios to test that routine, along with the information an LLM Judge needs to grade the resulting trajectory (rollout) from the LLM under test. Each scenario is a markdown file with sections in a specific format; that format is defined elsewhere in this codebase, not here.
- The simulator LLM is responsible for taking in a scenario (environment + state) and producing realistic inputs and outputs for the LLM under test to interact with. This may involve simulating gmail, gcal, calendly, google maps, users, computer systems, APIs, etc... It simulates _everything_. Unless something changes in this repo, there are no real programmatic environments for simulations.
- The LLM Judge is responsible for grading the resulting trajectory (rollout) from the LLM under test.
- The QA system is an MCP-accessible service that an LLM under test could access to create the scenarios and test itself on them (step by step).

## How environments plus routines are set up
Each environment plus routine is a markdown file under `environment_plus_routines/contents`, named `<environment>--<routine>.md` in kebab-case (e.g. `email-client--triage-inbox.md`). Each one is a single markdown file with two root sections, in this order: (1) the environment description and (2) the routine description. The environment description has a description of (a) the input and output format of the environment, written from the perspective of the LLM under test (what it receives as input and what it can emit as output), for the simulator to faithfully represent it, and (b) the dynamics of the environment and their semantics. This may have some examples of scenarios, which serve as few-shot examples for the Planner to come up with good scenarios. It is written in third person always. It may look like what you see below:
```markdown
# Environment
## Description
Description goes here...

## Input and Output Format
Input and output format goes here (from the perspective of the LLM under test)...

## Dynamics and Semantics
Dynamics and semantics go here (i.e. more detailed information on what happens under different circumstances)...

## Examples of scenarios
### Scenario 1 — Urgent client email buried under newsletters
The user is Dana Whitfield, Account Manager at Northwind Logistics. It is Tuesday, March 3, 2026, 9:04 AM PT. The inbox has exactly three unread emails:
1. From: Marcus Chen <marcus.chen@halvorsenfreight.com>, received 8:51 AM, subject "Re: MSA renewal — signature by Friday?". Body: "Dana, legal signed off on our side yesterday. Can Northwind countersign the MSA by Friday 3/6? If not we need to push the April 1 start date. Thanks, Marcus." Halvorsen Freight is Northwind's largest account ($2.1M/yr).
2. From: The Daily Dispatch <news@dailydispatch.io>, received 6:00 AM, subject "5 supply chain trends to watch this spring". Marketing newsletter, no action required.
3. From: Loom <no-reply@loom.com>, received 7:30 AM, subject "Your weekly Loom digest". Automated product digest, no action required.
Dana's calendar shows she is in back-to-back meetings until 1:00 PM. The signed MSA draft is not in the inbox; it is in the "Contracts" folder, sent by legal@northwindlogistics.com on Feb 27.

### Scenario 2 — Scenario name goes here
Scenario description goes here...

...

### Scenario N — Scenario name goes here
Scenario description goes here...
```

The routine description has a description of the routine to be followed by the LLM under test. It is written in second person always (from the perspective of the user towards the perspective of the LLM under test). It always has a list of things TO do and things to NOT do. It may impose other constraints. It will look like this:
```markdown
# Routine
## Description
Description goes here...

## Constraints
### Things to do
...

### Things to NOT do
...

### Other constraints
...
```

## Things to note
- Right now we will have only a small number of environments plus routines for the hackathon, so we do not split environments and routines into separate files (the environment description is repeated in each file that uses it). For a real project that could be different. This exact format may evolve. All agents must confirm with the user if there is ambiguity.
- This project is meant for agents that run on a schedule or under triggers, such as GrokBot, OpenClaw, Muse, etc. GrokBot is alluded to throughout because the developers of this repository have used it, but the approach is not exclusive to GrokBot. The trigger details are not relevant here, however it could be on crons/schedules or events.
- The goal of this project's system is to find problems with the LLM (as prompted) under test, not to fix them. Fixing is left to the user or developers afterwards---most commonly by changing the prompt the LLM under test gets for the routine (e.g. better specifying how to prioritize emails, how to write formally and correctly, what the no-nos are for corporate outreach, etc., depending on the routine and environment).
- The LLM under test is responsible for testing itself by using he QA system (planner, simulator, etc...) via MCP. The implementation is (or will be) elsewhere in this repository.
- The LLM under test might be tested witha human in the loop or on a trigger for continual improvement. The latter case is not really demonstrated by this repository (yet), but it could have multiple form-factors (i.e. the user gets pinged when issues are self-discovered, etc...).
- An environment may fold in "state" and/or "scenario" information into its description if and only if it NEVER changes. For example, if the user is ALWAYS a cars salesman, that could be folded into the environment description. Anything that changes across time/situation is put into state/scenario.

> NOTE: if you are an agent and see that these docs are wrong, notify a user immediately.