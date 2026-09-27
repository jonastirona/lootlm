# Discovery 01 collection

The prototype collection contains 24 distinct model IDs in one box. Every award grants 1,000,000 combined input and generated tokens. Duplicate awards are additive allowances; they are not converted, traded, or merged in the ledger.

The demo odds are deliberately marked provisional:

| Tier | Models | Tier probability |
| --- | ---: | ---: |
| Starter | 4 | 30% |
| Common | 6 | 35% |
| Specialist | 6 | 20% |
| Epic | 4 | 10% |
| Legendary | 3 | 4% |
| Mythic | 1 | 1% |

The integer per-model weights are published in `loot collection`; slight differences inside Common, Specialist, and Legendary only distribute the tier total exactly. Adding or removing models must not change a tier's probability budget without publishing a new pool version.

`config/collection-demo.json` drives the no-cost demo. `config/collection-openrouter-draft.json` is a catalog-validated pricing snapshot for internal review. Catalog presence, context length, and advertised parameters do not establish supplier authorization, live reliability, or a quality ranking. Suggested uses are hypotheses until model-specific evaluations pass.

The draft is not an economic approval. A fully generated million-token Mythic allowance could cost far more than the proposed box price at current catalog ceilings. Paid odds, allowance shape, and price must be modeled from realistic input/output consumption and worst-case exposure before launch.

The reveal uses the complete pool as a cosmetic reel. The server selects and persists the result before animation begins. Reduced-motion and `--no-animation` paths skip the full-screen sequence without changing the draw.
