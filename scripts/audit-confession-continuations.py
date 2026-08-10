"""Find book-less continuations that cannot inherit a book.

`continuedVerseRegex` only fires when the preceding linked reference is a
full `Book chapter:verse`. If the seed is chapter-only (`Rom 1; 11:7-8`) or
the continuation is a bare number (`Heb 11; 6`), the continuation is left as
plain text and never becomes a link.
"""
import glob
import json
import os
import re

ROOT = "c:/code/confession"
bookmap = json.load(
    open(f"{ROOT}/apps/web/src/lib/bible/bookMap.json", encoding="utf-8")
)
CODES = {v.lower() for v in bookmap.values()}

hits = []
for path in sorted(glob.glob(f"{ROOT}/shared/data/confessions/*.json")):
    name = os.path.basename(path)
    if name == "manifest.json":
        continue
    doc = json.load(open(path, encoding="utf-8"))
    label = doc.get("unitLabel", "Unit")
    for unit in doc["units"]:
        for pi, para in enumerate(unit["content"], 1):
            for tag in re.findall(r"\{\{proofs:\s*([^}]+)\}\}", para):
                seed_kind = None      # 'verse' | 'chapter' | None
                for ref in tag.split(";"):
                    ref = ref.strip()
                    m = re.match(r"^([1-3]?[A-Za-z]{2,4})\.?\s+(.+)$", ref)
                    if m and m.group(1).lower() in CODES:
                        body = m.group(2).strip()
                        seed_kind = "verse" if ":" in body else "chapter"
                        continue
                    # book-less continuation
                    if re.fullmatch(r"\d+:[\d\s,-]+", ref):
                        if seed_kind != "verse":
                            hits.append((f"{name} {label} {unit['number']} para {pi}",
                                         tag, ref,
                                         "verse continuation after a chapter-only ref"))
                    elif re.fullmatch(r"\d+(?:-\d+)?", ref):
                        if seed_kind != "chapter":
                            hits.append((f"{name} {label} {unit['number']} para {pi}",
                                         tag, ref,
                                         "bare number after a verse ref (corrupted colon?)"))

print(f"unlinkable continuations: {len(hits)}\n")
for where, tag, ref, why in hits:
    print(f"{where}")
    print(f"    tag: {{{{proofs: {tag}}}}}")
    print(f"    -> {ref!r}  {why}\n")
