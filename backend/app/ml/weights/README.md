# Runtime weights

Run `python scripts/download_models.py` from the repository root. It downloads the three v1.0.0 release assets and verifies `release-manifest.json` SHA-256 hashes.

Keep the metadata files alongside the weights. Missing/incompatible models leave the affected image prediction unavailable. See backend startup logs. Development metrics are not clinical validation.
