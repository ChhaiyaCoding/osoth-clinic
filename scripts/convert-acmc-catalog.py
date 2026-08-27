"""Turn the extracted PDF rows into the app's drug catalog JSON."""
import json
import re
from collections import Counter

import os
ROWS = os.environ.get("ROWS", "rows.json")
OUT = os.environ.get("OUT", "src/data/acmc-medicines.json")

# Source wording -> the app's DrugForm enum. The verbatim wording is kept in
# `formLabel`, so nothing clinical is lost by the mapping being coarse.
FORM_MAP = {
    "tablet": "tablet",
    "sublingual tablet": "tablet",
    "vaginal tab": "tablet",
    "capsule": "capsule",
    "capsule/tablet": "capsule",
    "capsule or tablet": "capsule",
    "syrup": "syrup",
    "nebulising suspension": "suspension",
    "ampoule": "injection",
    "vial": "injection",
    "prefilled syringe": "injection",
    "bottle": "infusion",
    "powder": "powder",
    "powder for dilution": "powder",
    "cream": "cream",
    "cutaneous emulsion": "cream",
    "ointment": "ointment",
    "eye ointment": "ointment",
    "eye drop": "drops",
    "eye / ear drop": "drops",
    "eye /nose": "drops",
    "oral inhalation": "inhaler",
    "inhalant": "inhaler",
    "nasal spray": "spray",
    "suppository": "suppository",
    "patch [external]": "patch",
    "rectal enema": "solution",
    "mouth wash solution": "solution",
    "jelly": "other",
    "madicated shampoo": "other",
}

# The unit stock is counted in, per form.
UNIT_MAP = {
    "tablet": "tablet",
    "capsule": "capsule",
    "syrup": "ml",
    "suspension": "ml",
    "injection": "vial",
    "infusion": "bottle",
    "powder": "sachet",
    "cream": "tube",
    "ointment": "tube",
    "drops": "bottle",
    "inhaler": "inhaler",
    "spray": "bottle",
    "suppository": "suppository",
    "patch": "patch",
    "solution": "ml",
    "other": "unit",
}

CONTROLLED_RE = re.compile(r"narcotic|opioid|morphine|fentanyl|oxycodone|ketamine|midazolam|diazepam|pethidine|phenobarbital", re.I)


def slug(text, limit):
    return re.sub(r"[^A-Z0-9]+", "", (text or "").upper())[:limit]


def strip_number(category):
    """'3. Anti-microbial medicines' -> 'Anti-microbial medicines'"""
    if not category:
        return None
    return re.sub(r"^\d{1,2}\.\s*", "", category).strip()


def title_section(section):
    """'ORAL MEDICINES' -> 'Oral medicines'"""
    if not section:
        return None
    return section.capitalize() if section.isupper() else section


def main():
    rows = json.load(open(ROWS))
    used = Counter()
    out = []

    for row in rows:
        generic = (row["generic"] or row["name"]).strip(" .")
        form_raw = (row["form"] or "").strip()
        form = FORM_MAP.get(form_raw.lower(), "other")

        classes = []
        for value in (row["drugClass"], strip_number(row["category"]), title_section(row["section"])):
            if value and value not in classes:
                classes.append(value)

        brands = [row["brand"]] if row["brand"] else []

        code_base = f"{slug(generic, 14)}-{slug(row['strength'], 7) or slug(form_raw, 4) or 'X'}"
        used[code_base] += 1
        code = code_base if used[code_base] == 1 else f"{code_base}-{used[code_base]}"

        notes = []
        if row["annotation"]:
            notes.append(row["annotation"])
        if row["noStock"]:
            notes.append("Currently no stock (per the June 2026 list)")
        notes.append(f"Source: ACMC Essential Medicines, June 2026, p.{row['page']}")

        out.append({
            "code": code,
            "nameEn": generic,
            "nameJa": row["japanese"] or "",
            "generic": generic,
            "brandNames": brands,
            "classes": classes,
            "form": form,
            "formLabel": form_raw or None,
            "strength": row["strength"] or "",
            "unit": UNIT_MAP.get(form, "unit"),
            "isControlled": bool(
                CONTROLLED_RE.search(" ".join(filter(None, [generic, row["drugClass"], row["category"]])))
            ),
            "note": "\n".join(notes),
        })

    catalog = {
        "source": "ACMC Essential Medicines list — Japan Heart Asia Children's Medical Center",
        "version": "June 2026",
        "importedFields": "Reference data only; prices, pack sizes and stock are left for the clinic to fill in.",
        "medicines": out,
    }
    with open(OUT, "w") as fh:
        json.dump(catalog, fh, ensure_ascii=False, indent=1)

    print("written:", len(out))
    print("forms:", dict(Counter(m["form"] for m in out)))
    print("controlled:", sum(m["isControlled"] for m in out))
    print("no-stock noted:", sum(1 for m in out if "no stock" in m["note"]))
    dupes = [c for c, n in Counter(m["code"] for m in out).items() if n > 1]
    print("duplicate codes:", dupes)


main()
