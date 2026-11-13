# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React + Vite + TypeScript frontend (three.js via react-three-fiber, deck.gl + MapLibre for the 3D map, framer-motion), Python FastAPI backend serving a LightGBM valuation engine. Chosen because the brief requires real 3D and a 3D price map, and the ML stack is Python.

## Users

Primary: hackathon judges for the Hero Housing Finance fintech challenge, who will type any Indian address or drop any pin and test the engine live. The product is framed as the console a housing-finance credit officer uses to value collateral during loan underwriting: they need a defensible number, how far to trust it, and whether a physical valuation can be skipped.

## Product Purpose

An AI property valuation engine for India that returns fair market value for residential (and, as a method demonstration, commercial) property, a calibrated range around it, a confidence score, the factors behind it, comparable evidence, and a lending recommendation (lendable value, LTV, waive / desktop review / physical visit). Success: judges can test any location and get a credible, explained answer, and the accuracy claims are backed by a benchmark against baseline methods.

## Positioning

Unlike Indian AVMs that anchor on one source (circle rates or a single portal's listings) and return a bare point estimate, this engine reconciles several biased data sources, uses satellite foundation embeddings and OpenStreetMap accessibility to value places with thin transaction data, and wraps every valuation in conformal intervals with coverage guarantees that drive a lend/visit decision.

## Operating Context

Used at a desk during loan underwriting or a live demo: address or map pin in, valuation report out. Outputs feed a credit decision and an audit trail, so every number must be traceable to evidence. Demo runs locally on a laptop.

## Capabilities and Constraints

- Data: public Kaggle listing datasets (Magicbricks 2023, 2020 listing challenge, six-metro listings, Bengaluru), OpenStreetMap places and amenities, Google AlphaEarth satellite embeddings (CC-BY 4.0). No registry, circle-rate or lender data in the prototype.
- Prices are asking prices rolled to the valuation date with stated assumptions (appreciation, ask-to-transaction discount, distress haircut); these must be visible, not hidden.
- Coverage is deepest in ~100 cities with listings; elsewhere the engine still answers, with visibly wider ranges and a physical-visit routing.
- Commercial valuation is a method demonstration only (no public Indian commercial dataset was found).

## Brand Commitments

Built for Hero Housing Finance's challenge; do not use Hero's logo or imply endorsement. Product name is our own.

## Evidence on Hand

- Benchmark results from engine/train.py written to artifacts/report.json (random, unseen-locality and unseen-city splits; baselines: city median, locality median, hedonic regression, attributes-only GBM; ablations).
- Research base: docs/RESEARCH.md.
- No testimonials, customers, or lender validation exist; never fabricate them.

## Product Principles

1. Never bluff: every value ships with its range, and thin evidence shows as a wider range and a stricter routing.
2. Show the evidence: comparables, factors and assumptions are always one glance away.
3. Speak the lender's language: lendable value, LTV, confidence, waive or visit.
4. Anywhere in India gets an answer.

## Accessibility & Inclusion

No product-specific requirement established; meet WCAG AA contrast and keyboard access for the core valuation flow.
