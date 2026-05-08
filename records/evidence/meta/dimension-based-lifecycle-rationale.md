# Dimension-Based Verification Rationale

This meta evidence documents a loop architecture change, not a domain fact.

## Problem

The previous single claim state chain overloaded technical proof, runtime scope, rejection, and product approval into one ordered field. It forced unrelated questions into sequence and made runtime proof look like a prerequisite for product approval even when the real authority was a decision.

## Analysis

Four approaches were considered:

- Keep the chain and add more states.
- Add parallel fields while keeping the chain.
- Replace the chain with independent verification dimensions.
- Move all proof state out of claims.

The dimension model was chosen because it keeps static, install, runtime, and product authority separate while preserving simple claim records.

## Decision

Claims now use `verification.static`, `verification.install`, `verification.runtime`, and `verification.product`. Experiments prove non-product dimensions with `verification.proves`. Decisions approve or reject product use.

## Trade-Offs

The rewrite breaks old fixtures and prompt language, but no production records exist. The long-term benefit is clearer proof matching, safer runtime approval, and less ambiguity for agents.

## Revisit Trigger

If verification grows beyond six dimensions, or if multiple dimensions begin sharing identical schema and proof rules, reconsider whether dimensions should become a normalized record type.
