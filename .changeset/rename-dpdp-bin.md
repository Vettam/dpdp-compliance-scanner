---
"dpdp-compliance-scanner": major
---

Rename the package to dpdp-compliance-scanner and replace the flat bins with one `dpdp` command (`scan page`, `notice lint`, `map diff`, `explain`, `version`). The old package name continues as a deprecated shim.

The unpublished version under the new name is 1.0.0 so this major changeset publishes 2.0.0. A major bump of 0.5.2 would stop at 1.0.0, and the shim depends on `dpdp-compliance-scanner@>=2`.
