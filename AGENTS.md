Constrains:
- follow SPEC.md
- everything in this repository should be in english
- Less is better, use the min words possible to explain in documentation and comments, high information density is better than long documents
- Add comments to scripts explaining reasoning and every step
- Prefer sequential, async and looping than a lot of functions to decompose on scripts
- Prefer tmux when terminal multiplexing helps
- Before say that something is done, test it manually if is possible
- Keep product artifacts under `skills/`; root files are only for governance, discovery, and CI
- Generated workflows must be standalone after scaffolding
- Record durable technical or workflow decisions as ADRs under `.specs/adr/*.md`
- Read existing ADRs before changing a previously chosen technical direction

## Repository organization and documentation

- Keep `README.md` as an overview: purpose, critical boundaries, first useful action, and links into `docs/README.md`.
- Put detailed procedures and reference material in `docs/`; update its index with every addition or move.
- Follow the [repository guide](docs/repository-guide.md) for file placement, validation, and data boundaries.
- Preserve existing canonical specs, ADRs, skill bundles, and evidence paths; do not reorganize sealed or generated data as documentation.
- Preserve prior work, stage explicit paths, and verify links, relevant checks, and the diff before an authorized push.
- Build tools must not delete authored documentation. Keep transient output and credentials outside tracked source.
