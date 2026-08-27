"""Extract the ACMC medicine list into structured JSON.

The layout is a table whose left columns (drug class, drug name, annotation,
Japanese name) are merged across several strength rows. Reading it needs three
corrections over a naive `extract_tables()`:

 1. Merged cells. `extract()` attaches a merged cell's text to one arbitrary row
    of the span — sometimes the first, sometimes a later one — so filling values
    downward loses the rows above. Instead the merged columns are read by
    geometry: each cell's own bounding box is cropped and its text applied to
    every strength row whose midpoint falls inside it. Dosage form and Strength
    are never merged and are taken per row.

 2. Category headings ("1. Antipyretic / Painkiller") sit between tables, so
    rows are matched to them by vertical position. Lines that only look like a
    heading but sit inside a table ("0.9 % isotonic NaCl in 100 ml") are
    rejected by testing against the table bounding boxes.

 3. Stock state is a fill colour, not text. The legend defines grey = "Currently
    no stock" and pale green = "Updated". The orange in the first column is
    decoration on the class header, not a marker, so colour *and* horizontal
    position are both checked, and the marker is tested against the Strength
    cell rather than the whole row — a merged row spans every strength and would
    otherwise flag them all.
"""
import json
import re
import sys

import pdfplumber

PDF = "/Users/apple/Downloads/Osoth Clinic /Osoth list/ACMC-Medicine-List-_June-2026_pharmacy.pdf"

NO_STOCK_GREY = 0.651
UPDATED_GREEN = (0.886, 0.937, 0.855)
TOLERANCE = 0.02
MARKER_MIN_X = 160.0
LEGEND_MAX_TOP = 90.0

SECTION_RE = re.compile(r"^((?:ORAL|INJECTION|EXTERNAL|INHALATION|OTHER)[A-Z \-/&']*MEDICINES?)")
CATEGORY_RE = re.compile(r"^(\d{1,2})\.\s+([A-Za-z][^（(]*)")
BRACKET_RE = re.compile(r"【([^】]+)】\s*(.*)")

CLASS_COL, NAME_COL, FORM_COL, STRENGTH_COL, ANNOTATION_COL, JAPANESE_COL = range(6)
MERGED_COLS = (CLASS_COL, NAME_COL, ANNOTATION_COL, JAPANESE_COL)


def clean(value):
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def is_grey(color):
    if isinstance(color, (int, float)):
        return abs(color - NO_STOCK_GREY) <= TOLERANCE
    if isinstance(color, (tuple, list)) and len(color) == 1:
        return abs(color[0] - NO_STOCK_GREY) <= TOLERANCE
    return False


def is_green(color):
    return (
        isinstance(color, (tuple, list))
        and len(color) == 3
        and all(abs(a - b) <= TOLERANCE for a, b in zip(color, UPDATED_GREEN))
    )


def markers(page, predicate):
    return [
        r
        for r in page.rects
        if predicate(r.get("non_stroking_color"))
        and r["x0"] >= MARKER_MIN_X
        and r["top"] >= LEGEND_MAX_TOP
    ]


def column_bounds(table):
    """x-ranges per column index, taken from the widest row in the table."""
    best = None
    for row in table.rows:
        cells = [c for c in row.cells if c]
        if len(cells) == 6 and (best is None or len(cells) > len(best)):
            best = cells
    if not best:
        return None
    return [(c[0], c[2]) for c in best]


def merged_values(page, table, bounds):
    """
    Rebuild each merged column as a list of (top, bottom, text) cells.

    Two deliberate choices here, both forced by how this PDF is drawn:

    * Cell *boundaries* come from the horizontal rules that actually cross the
      column. `table.cells` cannot be trusted: it mixes tight per-row boxes with
      taller boxes covering a merged span, and the two overlap.
    * Cell *text* comes from `extract_text_lines()`, never from cropping a cell
      box. Cropping the wrong (taller) box interleaves two rows' characters into
      gibberish like "【PBuelrmodicuoarlt..】".

    A cell with no text of its own continues the one above it — that is what a
    vertically merged cell looks like once the rules are read.
    """
    t_x0, t_top, t_x1, t_bottom = table.bbox
    columns = {}

    for col in MERGED_COLS:
        cx0, cx1 = bounds[col]

        edges = {round(t_top, 1), round(t_bottom, 1)}
        for edge in page.edges:
            if edge["orientation"] != "h":
                continue
            if edge["top"] < t_top - 2 or edge["top"] > t_bottom + 2:
                continue
            if edge["x0"] <= cx0 + 2 and edge["x1"] >= cx1 - 2:
                edges.add(round(edge["top"], 1))
        bands = sorted(edges)

        lines = [
            (line["top"], line["bottom"], clean(line["text"]))
            for line in page.crop((cx0, t_top, cx1, t_bottom)).extract_text_lines()
            if clean(line["text"])
        ]

        cells = []
        for top, bottom in zip(bands, bands[1:]):
            if bottom - top < 2:
                continue
            hits = [
                text for l_top, l_bottom, text in lines if l_top < bottom - 1 and l_bottom > top + 1
            ]
            cells.append((top, bottom, " ".join(hits) if hits else None))
        columns[col] = cells

    return columns


def value_at(cells, top, bottom):
    """The column's value for a strength row: the cell it overlaps most."""
    scored = [
        (min(bottom, c_bottom) - max(top, c_top), text)
        for c_top, c_bottom, text in cells
        if min(bottom, c_bottom) - max(top, c_top) > 0
    ]
    return max(scored)[1] if scored else None


def main():
    rows = []
    with pdfplumber.open(PDF) as pdf:
        section = None
        for page_no, page in enumerate(pdf.pages, start=1):
            tables = page.find_tables()
            table_boxes = [t.bbox for t in tables]

            def inside_table(top):
                return any(box[1] - 2 <= top <= box[3] + 2 for box in table_boxes)

            headings = []
            for line in page.extract_text_lines():
                text = " ".join(line["text"].split())
                m = SECTION_RE.match(text)
                if m:
                    headings.append((line["top"], "section", m.group(1).strip()))
                    continue
                m = CATEGORY_RE.match(text)
                if m and not inside_table(line["top"]):
                    headings.append((line["top"], "category", f"{m.group(1)}. {m.group(2).strip()}"))
            headings.sort()

            no_stock = markers(page, is_grey)
            updated = markers(page, is_green)
            category = None

            for table in tables:
                bounds = column_bounds(table)
                if not bounds:
                    continue
                spans = merged_values(page, table, bounds)
                extracted = table.extract()
                last_form = None
                # A merged cell sometimes has a hairline rule drawn across it,
                # which splits its band and leaves the lower part textless.
                # `carried` fills those; see the row loop for the rules on which
                # columns may inherit and when.
                carried = {col: None for col in MERGED_COLS}
                carried["name"] = None

                for row_obj, raw in zip(table.rows, extracted):
                    cells = [clean(c) for c in raw] + [None] * 6
                    if cells[CLASS_COL] == "Drug classes" or cells[NAME_COL] == "Drug names":
                        continue

                    boxes = list(row_obj.cells)
                    strength_box = boxes[STRENGTH_COL] if len(boxes) > STRENGTH_COL else None
                    form_box = boxes[FORM_COL] if len(boxes) > FORM_COL else None
                    marker_box = strength_box or form_box or row_obj.bbox
                    m_x0, m_top, m_x1, m_bottom = marker_box

                    form = cells[FORM_COL]
                    strength = cells[STRENGTH_COL]
                    if not (form or strength):
                        continue
                    if form:
                        last_form = form
                    else:
                        form = last_form

                    top, bottom = marker_box[1], marker_box[3]
                    found = {col: value_at(spans[col], top, bottom) for col in MERGED_COLS}

                    # Name and class continue downward: a blank one always means
                    # "same as above", never "this drug has no name".
                    for col in (NAME_COL, CLASS_COL):
                        if found[col] is not None:
                            carried[col] = found[col]
                        else:
                            found[col] = carried[col]

                    # Annotation and Japanese name are different: blank is
                    # meaningful there. Carry them only while still inside the
                    # same drug, or an annotation leaks onto the next medicine.
                    same_drug = found[NAME_COL] is not None and found[NAME_COL] == carried["name"]
                    for col in (ANNOTATION_COL, JAPANESE_COL):
                        if found[col] is not None:
                            carried[col] = found[col]
                        elif not same_drug:
                            carried[col] = None
                        found[col] = carried[col]
                    carried["name"] = found[NAME_COL]

                    drug_class = found[CLASS_COL]
                    drug_name = found[NAME_COL]
                    annotation = found[ANNOTATION_COL]
                    japanese = found[JAPANESE_COL]

                    if not drug_name:
                        continue

                    for h_top, kind, label in headings:
                        if h_top <= row_obj.bbox[1]:
                            if kind == "section":
                                section = label
                            else:
                                category = label

                    def hit(rects):
                        return any(
                            r["top"] < m_bottom - 1
                            and r["bottom"] > m_top + 1
                            and r["x0"] < m_x1
                            and r["x1"] > m_x0
                            for r in rects
                        )

                    brand = None
                    generic = drug_name
                    m = BRACKET_RE.match(drug_name)
                    if m:
                        brand = m.group(1).strip(" .")
                        generic = m.group(2).strip() or drug_name

                    rows.append({
                        "page": page_no,
                        "section": section,
                        "category": category,
                        "drugClass": drug_class,
                        "name": drug_name,
                        "generic": generic,
                        "brand": brand,
                        "form": form,
                        "strength": strength,
                        "annotation": annotation,
                        "japanese": japanese,
                        "noStock": hit(no_stock),
                        "updated": hit(updated),
                    })

    json.dump(rows, sys.stdout, ensure_ascii=False, indent=1)
    print(
        f"rows={len(rows)} noStock={sum(r['noStock'] for r in rows)} "
        f"updated={sum(r['updated'] for r in rows)} "
        f"noForm={sum(1 for r in rows if not r['form'])}",
        file=sys.stderr,
    )


main()
