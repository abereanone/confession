"""Audit every scripture citation in every confession file.

Pass 1  broken   - reference does not parse, or points at a verse that
                   does not exist in the BSB corpus
Pass 2  unlinked - reference is real but written in a form the site's
                   autolinker cannot turn into a link
Pass 3  mismatch - a quotation is followed by a proof tag whose verse text
                   shares almost no wording with the quote
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict

ROOT = "c:/code/confession"
bsb = json.load(open(f"{ROOT}/shared/data/bsb.json", encoding="utf-8"))
bookmap = json.load(
    open(f"{ROOT}/apps/web/src/lib/bible/bookMap.json", encoding="utf-8")
)

# ---------------------------------------------------------------- corpus index
text = {}      # (book, chapter, verse) -> str
chapters = defaultdict(int)
for book, chs in bsb.items():
    for ci, ch in enumerate(chs, 1):
        chapters[(book.lower(), ci)] = max(v["verse"] for v in ch)
        for v in ch:
            text[(book.lower(), ci, v["verse"])] = v["text"]

CODES = {c.lower() for c in bookmap.values()}
SINGLE_CHAPTER = {"oba", "phm", "2jn", "3jn", "jud"}

broken, unlinked, mismatch = [], [], []


def verses_of(book, ch, spec):
    """Verse numbers named by a `1, 3-5` style spec, or None if malformed."""
    out = []
    for piece in spec.split(","):
        piece = piece.strip()
        m = re.fullmatch(r"(\d+)(?:-(\d+))?", piece)
        if not m:
            return None
        lo = int(m.group(1))
        hi = int(m.group(2) or lo)
        if hi < lo:
            return None
        out.extend(range(lo, hi + 1))
    return out


def check_ref(ref, where, carried=None):
    """Validate one citation. Returns (verse texts, book for continuations).

    `carried` is the book from the previous `;`-separated reference: the site's
    continuedVerseRegex lets `Mat 3:17; 17:5` inherit the book, so a book-less
    reference is legal rather than broken.
    """
    raw = ref
    ref = ref.strip()
    if not ref:
        return [], carried

    m = re.match(r"^([1-3]?[A-Za-z]{2,4})\.?\s+(.*)$", ref)
    if not m:
        # Book-less continuation: only valid as `chapter:verse` after a book.
        if re.fullmatch(r"\d+:[\d\s,-]+", ref):
            if carried is None:
                broken.append((where, raw, "book-less ref with no preceding book"))
                return [], carried
            book, body = carried, ref
        else:
            broken.append((where, raw, "cannot parse"))
            return [], carried
    else:
        book, body = m.group(1).lower(), m.group(2).strip()
        if book not in CODES:
            broken.append((where, raw, f"unknown book '{m.group(1)}'"))
            return [], carried

    # --- forms the autolinker cannot handle -------------------------------
    if re.search(r"\bf{1,2}\.?$", body):
        unlinked.append((where, raw, "open-ended 'f.'/'ff.' - name the verses"))
        body = re.sub(r"\s*\bf{1,2}\.?$", "", body).strip()
    if re.search(r"\band\b", body):
        unlinked.append((where, raw, "'and' between verses - use a comma"))
        body = body.replace("and", ",")
    if re.search(r"\d+:\d+\s*-\s*\d+:\d+", body):
        unlinked.append((where, raw, "cross-chapter range - split per chapter"))
        return [], book
    if re.search(r"\d[a-c]\b", body):
        unlinked.append((where, raw, "verse-part letter - drop it"))
        body = re.sub(r"(\d)[a-c]\b", r"\1", body)
    if ":" not in body and book in SINGLE_CHAPTER:
        if not re.fullmatch(r"\d+", body.strip()):
            unlinked.append((where, raw, "single-chapter book range needs '1:'"))
        return [], book
    if ":" not in body:
        if re.fullmatch(r"[\d\s,;-]+", body):
            unlinked.append((where, raw, "chapter-only - no verse cited"))
        else:
            broken.append((where, raw, "no verse and not a plain chapter"))
        return [], book

    body = re.sub(r"\s*,\s*", ", ", re.sub(r"\s+", " ", body)).strip(" ,")
    cm = re.match(r"^(\d+):(.+)$", body)
    if not cm:
        broken.append((where, raw, "cannot parse chapter:verse"))
        return [], book
    ch, spec = int(cm.group(1)), cm.group(2)
    if (book, ch) not in chapters:
        broken.append((where, raw, f"no chapter {ch} in {book}"))
        return [], book

    got = verses_of(book, ch, spec)
    if got is None:
        broken.append((where, raw, "cannot parse verse list"))
        return [], book
    out = []
    for v in got:
        if (book, ch, v) not in text:
            broken.append(
                (where, raw, f"{book} {ch}:{v} does not exist "
                             f"(chapter has {chapters[(book, ch)]} verses)")
            )
        else:
            out.append(text[(book, ch, v)])
    return out, book


STOP = set("""a an the and or but for of in on to with that this these those is
are was were be been by from as he she it him his her they them their we us our
you your i my me not no all who whom which what when there then so shall will
unto upon into out up down o thou thy thee ye hath have has had do does did
""".split())


def words(s):
    return {w for w in re.findall(r"[a-z]+", s.lower()) if w not in STOP and len(w) > 2}


# ---------------------------------------------------------------- walk files
for path in sorted(glob.glob(f"{ROOT}/shared/data/confessions/*.json")):
    name = os.path.basename(path)
    if name == "manifest.json":
        continue
    doc = json.load(open(path, encoding="utf-8"))
    label = doc.get("unitLabel", "Unit")
    for unit in doc["units"]:
        for pi, para in enumerate(unit["content"], 1):
            where = f"{name} {label} {unit['number']} para {pi}"

            for tag in re.findall(r"\{\{proofs:\s*([^}]+)\}\}", para):
                carried = None
                for ref in tag.split(";"):
                    _, carried = check_ref(ref, where, carried)

            # Pass 3: quotation immediately followed by a proof tag.
            for qm in re.finditer(
                r"[\"\u201c]([^\"\u201c\u201d]{25,400})[\"\u201d]"
                r"[\s,.]*\{\{proofs:\s*([^}]+)\}\}",
                para,
            ):
                quote, tag = qm.group(1), qm.group(2)
                verse_texts = []
                carried = None
                for ref in tag.split(";"):
                    got, carried = check_ref(ref, where, carried)
                    verse_texts.extend(got)
                if not verse_texts:
                    continue
                qw = words(quote)
                vw = set()
                for t in verse_texts:
                    vw |= words(t)
                if not qw:
                    continue
                overlap = len(qw & vw) / len(qw)
                if overlap < 0.20:
                    mismatch.append((where, tag, round(overlap, 2),
                                     quote[:90], " / ".join(verse_texts)[:110]))


def dump(title, rows, fmt):
    print(f"\n{'='*78}\n{title}  ({len(rows)})\n{'='*78}")
    seen = set()
    for r in rows:
        line = fmt(r)
        if line in seen:
            continue
        seen.add(line)
        print(line)


dump("BROKEN - bad reference or non-existent verse", broken,
     lambda r: f"{r[0]}\n    {r[1]!r}  -> {r[2]}")
dump("UNLINKED - real verse, but written so it will not link", unlinked,
     lambda r: f"{r[0]}\n    {r[1]!r}  -> {r[2]}")
dump("POSSIBLE MISMATCH - quote does not match cited verse", mismatch,
     lambda r: (f"{r[0]}  [{r[1]}]  overlap={r[2]}\n"
                f"    quote: {r[3]}\n    verse: {r[4]}"))
