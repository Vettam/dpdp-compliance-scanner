# Python code scanner

The parser is a purpose-built tokenizer in `parse.ts`. It is not a tree-sitter WASM grammar, and a scan does not need a Python interpreter.

Spec §3.2 requires that `npx` first-run work without Python. Both a bundled grammar and this tokenizer meet that. Tree-sitter would also add a runtime dependency and a grammar binary to the published package. This scanner only needs logical lines, indentation, imports, calls, and string literals — the shapes in spec §5.2 — so a full Python AST is unused weight. The decision is also recorded in `docs/spec-v2.md` §3.2 and §14.

Each detection is its own module, with fixtures in `test/scanners/python/`.

| Module | What it reads |
|---|---|
| `schema.ts` | Django models (`Meta.db_table` or the class name), SQLAlchemy `Column`, `mapped_column`, and `Table`, Alembic `create_table` / `add_column` |
| `inputs.ts` | Django forms, Pydantic `BaseModel`, WTForms, Django REST framework serializers |
| `http.ts` | `requests`, `httpx`, `aiohttp`, `urllib`; a PyPI import whose package is `name` or `name-python` (so `import analytics` matches `analytics-python`) |
| `consent.ts` | A consent checkbox next to submit in an HTML or Jinja template; branches on `consent` / `has_consent` / `opt_in`; a Django or DRF middleware or permission class whose name is a consent word; a C10 vendor import |
| `retention.ts` | `deleted_at`, `expires_at`, `ttl` on a column; Celery `crontab` in a file that names the table and a deletion; a cron file that runs `manage.py` or `django-admin` for a management command that does the same |
| `rights.ts` | Django `path` / `re_path` / `url`, FastAPI and Flask route decorators, and a function name that is an access, erase, or correct path |

Raw `.sql` is read once, by the shared SQL reader that already runs on every code scan. This package does not parse those files again.

File walking, map assembly, and the shared checks (outbound-looking names, consent words, form slugs, retention column kinds, rights-path classification) live in `src/scanners/code/js/`. The modules here call those. Change the shared check there, and add a fixture on both sides when both languages use it.

Limits, until a fixture needs them: `match` / `case` is not its own block (calls inside it are still seen); a `;` does not split a line; a column name is taken from the positional argument, not `name=`.
