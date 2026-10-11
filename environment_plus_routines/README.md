# Environment Plus Routines
## Things you must understand
You should understand these definitions:
1. By an "environment" we mean an environment as the word is used more broadly, but irrespective of its state. For example, an "email client" that hs a specific API (for agents) and other semantics and behaviors is an environment. An email client with specific emails in it is NOT an environment.
2. By a "scenario" we mean an environment and its state (i.e. that tuple). Thus, an email client is NOT a scenario, but an email client with specific emails in it IS a scenario.
3. By a "state" we mean something analogous, in the examples above, to _which emails_ are present. It basically pins down what will happen next in the environment conditioned on different actions by the LLM under test.
4. By a "routine" we mean a task description for an LLM under test (i.e. GrokBot) to behave in an environment conditioned on its state (in other words, a task description for what to do under different scenarios).

You should understand that in our stack we have various LLMs enabling this.
- The LLM under test (i.e. GrokBot) is responsible for doing the routine. It is going to do the routine on (LLM) simulated scenarios and then in real scenarios.
- The LLM Planner takes in an environment plus routine and produces a scenario to test that routine, alongside as information requisite by an LLM jude to grade the resulting trajectory (rollout) from the LLM under test.
- The simulator LLM is repsonsible for taking in a scenario (environment + state) and produce realistic inputs and outputs for the LLM under test to interact with.
- The LLM Judge is responsible for grading the resulting trajectory (rollout) from the LLM under test.
- The QA system is an MCP-acessible service that an LLM-under-test could access to create the scenarios and test itself on them (step by step).

## How environments plus routines are set up
Each environment plus routine is a markdown file under `environment_plus_routines/contents`. Each one is a single markdown file with two root sections: (1) the environment description and (2) the routine description. The environment description has a description of (a) the input and output format of the environment (for the simulator to faithfully represent it) and (b) the dynamics of the environment and their semantics. This may have some examples of scenarios. It is written in third person always. It may look like what you see below:
```markdown
# Environment
## Description
Description goes here...

## Input and Output Format
Input and output format goes here...

## Dynamics and Semantics
Dynamics and semantics goes here (i.e. more detailed information on what happens under different circumstances)...

## Examples of scenarios
### Scenario 1 — Scenario name goes here
Scenario description goes here...

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