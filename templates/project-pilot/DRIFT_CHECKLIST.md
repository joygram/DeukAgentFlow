# Drift Checklist

Mark each line before implementation.

- [ ] No silent fallback remains in the touched path.
- [ ] No alias-only path is being treated as a real contract.
- [ ] No no-op or placeholder path is being counted as support.
- [ ] No generated artifact is being edited directly.
- [ ] No single-language patch is being presented as a shared fix.
- [ ] No provider/generator/template/report path hardcodes metadata-owned
      protocol method spellings.
- [ ] No generated record format surface is hardcoded outside protocol contract
      or generated-artifact manifest ownership.
- [ ] No schema JSON is embedded directly where schema metadata or manifest
      ownership is required.
- [ ] No DpField-style helper is selected directly where shared runtime contract
      ownership is required.
- [ ] No unsupported-by-contract path is being mislabeled as broken.
- [ ] No broken-entrypoint is being hidden as unsupported.
- [ ] Error behavior is explicit and testable.
- [ ] Verification covers the actual owner path.

## Known Exceptions

| Exception | Reason | Guard |
| --- | --- | --- |
| | | |
