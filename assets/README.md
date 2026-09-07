# assets

Drop a logo here as `logo.svg` (or `logo.png`) and Atlan Pulse will inline it
into the report masthead in place of the built-in mark. You can also point at
one anywhere on disk:

```bash
npx atlan-pulse --logo ~/Downloads/atlan-logo.svg
```

An SVG is inlined directly, so the report stays a single self-contained file
with no external requests. A PNG or JPG is embedded as a data URI.

Only use artwork you have the right to use. Nothing in this repo downloads a
logo for you, and no logo is bundled.
