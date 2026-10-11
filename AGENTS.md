# Development rules

## Readers

Two readers use this repository: the agent that changes the code and the person who oversees it. Each file has one primary reader. Write for that reader.

| What | Reader | Written as |
| --- | --- | --- |
| `AGENTS.md`, `docs/`, code comments, commit messages, READMEs | agent | English; dense; exact names; one home per fact |
| Pull request descriptions | person | Chinese prose; conclusion first; numbers in tables; state what was not run |
| Pages and diagrams used to understand something | person | Generate on demand; do not check them in |

Agent-facing prose is English. Person-facing prose is Chinese. Keep identifiers, commands, config keys, paths, diagram labels, and established technical terms in English everywhere.

Follow the spirit of Simplified Technical English (ASD-STE100): short sentences, one topic per sentence, active voice, a named actor, present tense, and imperative instructions. Use "must" for requirements and "do not" for prohibitions. Use the code name as the term. Do not use idioms, narrative, repeated facts, or synonyms for variety. Give one sentence of rationale and a citation when needed. State prohibitions and stop conditions. Clarity takes precedence over formal word lists or word counts.

Apply these rules to new or revised prose. Do not translate frozen evidence or upstream license text solely to change its language.

## Occam's Razor

Do the simplest thing that solves the problem. Add nothing without necessity.

- Do not add abstractions, layers, states, speculative features, or flexibility without a current requirement.
- Prefer direct, obvious code and design over clever solutions.
- Remove a piece if removal preserves required functionality.

The test: is every piece necessary? If not, delete it.

## No defensive programming

Do not check conditions that the code already makes impossible. Establish an invariant once at the boundary. Trust that invariant, assertions, and the type system downstream. Validate untrusted input once at its entry point; do not copy the same checks across internal calls.

Independent verification of a generated firmware artifact is a separate trust boundary. Do not remove it as redundant input validation; see [firmware gates](packages/firmware-core/README.md#download-gates).

## Project rules

- Preserve upstream licenses and attribution. Do not apply the project code license to user-owned content, third-party material, or firmware-derived assets. Do not make a formal public release (announced release, corresponding-source archive, or desktop package) before the [distribution gates](public/LICENSING.md#public-release-gate) are closed. This repository does not deploy the site yet; see [deployment status](docs/CLOUDFLARE-DEPLOYMENT.md#deployment-status).
- Preserve unrelated work, input bytes, and pinned asset identities. Create a new version or output when identities change; follow [asset regeneration](docs/WEB-DEVELOPMENT.md#assets-and-reproduction).
- Keep user computation local. Do not introduce a compute backend or a Python runtime dependency; follow [module boundaries](docs/ARCHITECTURE.md).
- Use the exact imported CUBE as the fitting target. Keep RAW exposure and White Balance bound to the source photo; follow [data contracts](docs/ARCHITECTURE.md#data-contracts).
- Preserve complete final-candidate checks. Do not accept missing evidence, reuse an old PASS, weaken thresholds, or expose a BIN after failure, cancellation, or timeout. Release decisions must use explicit errors; Python `assert` disappears under `-O`. See [release verification](gr_firmware/README.md).
- Bind task results to their input identity and generation. Cancel and release RAW work by photo ownership; keep RAW processing serial. See [RAW lifecycle](docs/ARCHITECTURE.md#color-and-raw).
- Keep camera acceptance separate from offline verification. Do not inherit a reference firmware's device result for a new candidate; see [release status](docs/IMPLEMENTATION-STATUS.md).

## Tools and verification

- Use `uv` for all Python environments and commands. Use the locked dependencies and prebuilt assets; see [development commands](docs/WEB-DEVELOPMENT.md).
- For library/API questions, resolve current documentation with `npx ctx7@latest library <name> "<question>"`, then fetch it with `npx ctx7@latest docs <libraryId> "<question>"`. Do not use this lookup for routine refactoring or business logic.
- Run checks appropriate to the change. Documentation-only changes need link and diff checks; they do not need a firmware rebuild. For runtime or platform changes, use the relevant [verification matrix](docs/WEB-DEVELOPMENT.md#verification). Report failures, missing inputs, and checks not run.
- Do not commit official or generated firmware, RAW inputs, caches, or installation bundles. Follow the [asset policy](docs/WEB-DEVELOPMENT.md#assets-and-reproduction).
