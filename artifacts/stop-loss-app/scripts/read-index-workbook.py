import json
import hashlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def column_number(letters):
    value = 0
    for character in letters:
        value = value * 26 + ord(character) - 64
    return value


def column_name(number):
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def read_matrix(z, target, shared):
    if not target.startswith("xl/"):
        target = "xl/" + target
    root = ET.fromstring(z.read(target))
    cells = []
    max_row = 0
    max_col = 0
    for row in root.findall(".//{%s}sheetData/{%s}row" % (MAIN_NS, MAIN_NS)):
        row_number = int(row.attrib.get("r", "0"))
        max_row = max(max_row, row_number)
        for cell in row.findall("{%s}c" % MAIN_NS):
            match = re.match(r"([A-Z]+)([0-9]+)", cell.attrib.get("r", ""))
            if not match:
                continue
            letters, row_text = match.groups()
            col_number_value = column_number(letters)
            value_node = cell.find("{%s}v" % MAIN_NS)
            value = ""
            if value_node is not None:
                value = value_node.text or ""
                if cell.attrib.get("t") == "s":
                    value = shared[int(value)]
            if cell.attrib.get("t") == "inlineStr":
                value = "".join(
                    text.text or ""
                    for text in cell.iter("{%s}t" % MAIN_NS)
                )
            cells.append((int(row_text), col_number_value, value))
            max_col = max(max_col, col_number_value)
    matrix = [["" for _ in range(max_col)] for _ in range(max_row)]
    for row_number, col_number_value, value in cells:
        matrix[row_number - 1][col_number_value - 1] = value
    while matrix and not any(str(value).strip() for value in matrix[-1]):
        matrix.pop()
    return matrix


def clean_header(value, index):
    value = str(value or "").strip()
    return value if value else "Column %s" % column_name(index + 1)


def serial_date(value):
    """Convert Excel serial dates, without changing ordinary numeric fields."""
    text = str(value or "").strip()
    if not re.match(r"^\d+(?:\.\d+)?$", text):
        return value
    number = float(text)
    if number < 20000 or number > 100000:
        return value
    return (date(1899, 12, 30) + timedelta(days=number)).isoformat()


def rows_from(matrix, header_index=0, start_index=None, start_col=0, end_col=None,
              date_headers=False):
    if not matrix or header_index >= len(matrix):
        return []
    if not any(str(value or "").strip() for value in matrix[header_index]):
        for candidate in range(header_index + 1, len(matrix)):
            if any(str(value or "").strip() for value in matrix[candidate]):
                header_index = candidate
                break
    headers = matrix[header_index]
    end_col = end_col if end_col is not None else len(headers)
    keys = [
        clean_header(headers[index], index - start_col)
        for index in range(start_col, min(end_col, len(headers)))
    ]
    rows = []
    for values in matrix[(header_index + 1 if start_index is None else start_index):]:
        selected = values[start_col:end_col]
        if not any(str(value or "").strip() for value in selected):
            continue
        nonempty = [
            (index, str(value or "").strip().casefold())
            for index, value in enumerate(selected)
            if str(value or "").strip()
        ]
        # Some source tabs repeat their header at the bottom of the data range
        # (the August Agent tab has a lone "Name" row).  It is not a record.
        header_values = [str(value or "").strip().casefold() for value in headers[start_col:end_col]]
        if nonempty and len(nonempty) <= 2 and all(
            index < len(header_values) and value == header_values[index]
            for index, value in nonempty
        ):
            continue
        row = {}
        for index, key in enumerate(keys):
            value = selected[index] if index < len(selected) else ""
            if date_headers and re.search(r"\b(date|effective|eff|expire|exp)\b", key, re.I):
                value = serial_date(value)
            row[key] = value
        rows.append(row)
    return rows


def canonical_agent_rows(rows):
    aliases = {
        "Agent ID": "ID", "Agent name": "Name", "Agent number": "License Number",
        "Agent license expiry date": "License Exp Date",
        "Agent phone number": "Phone Number", "Agent email address": "Email Address",
    }
    return [
        {aliases.get(key, key): value for key, value in row.items()}
        for row in rows
    ]


def main(path):
    with open(path, "rb") as source:
        source_bytes = source.read()
    source_id = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
    with zipfile.ZipFile(path) as workbook:
        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall("{%s}si" % MAIN_NS):
                shared.append(
                    "".join(
                        text.text or ""
                        for text in item.iter("{%s}t" % MAIN_NS)
                    )
                )
        workbook_root = ET.fromstring(workbook.read("xl/workbook.xml"))
        rel_root = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        relationships = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in rel_root
        }
        source_tabs = []
        raw_tabs = []
        matrices = {}
        for sheet in workbook_root.find("{%s}sheets" % MAIN_NS):
            name = sheet.attrib["name"]
            target = relationships[sheet.attrib["{%s}id" % REL_NS]]
            matrix = read_matrix(workbook, target, shared)
            matrices[name] = matrix
            raw_rows = rows_from(matrix, date_headers=True)
            raw_tabs.append({"name": name, "sourceId": source_id, "rows": raw_rows})
            if name == "Broker":
                rows = rows_from(matrix, 0, 1, 0, 3)
            elif name.lower() in ("agent", "agents"):
                rows = rows_from(matrix, 0, 1, 0, None, True)
                rows = canonical_agent_rows(rows)
            elif name.lower() in ("sales reps", "sales reps (2)"):
                rows = rows_from(matrix, 0, 1, 0, None, True)
            else:
                rows = rows_from(matrix, date_headers=True)
            if rows:
                source_tabs.append({"name": name, "sourceId": source_id, "rows": rows})

        # Broker contains two adjacent tables in the source workbook. Keep the
        # original Broker index and expose its brokerage table as a first-class
        # lookup used by licensing and CRM.
        broker_matrix = matrices.get("Broker", [])
        brokerage_rows = rows_from(broker_matrix, 1, 2, 4, 14, True)
        if brokerage_rows:
            source_tabs.append({"name": "Brokerages", "sourceId": source_id, "rows": brokerage_rows})

        agent_matrix = matrices.get("Agent", matrices.get("Agents", []))
        agent_rows = canonical_agent_rows(
            rows_from(agent_matrix, 0, 1, 0, None, True)
        )
        if agent_rows:
            source_tabs.append({"name": "Agents", "sourceId": source_id, "rows": agent_rows})

        sales_matrix = matrices.get("Sales reps (2)", matrices.get("Sales reps", []))
        sales_rows = rows_from(sales_matrix, date_headers=True)
        if sales_rows and not any(tab["name"] == "Sales reps" for tab in source_tabs):
            source_tabs.append({"name": "Sales reps", "sourceId": source_id, "rows": sales_rows})

    names = [tab["name"] for tab in source_tabs]
    # These are lookup names consumed by the workspace.  An unavailable marker
    # is intentional: callers can distinguish an absent source tab from an
    # empty result and must not silently fall back to v10 data.
    expected = ["Broker", "Brokerages", "Agent", "Agents", "Branch", "Program",
                "Sales reps", "Policyholder", "Association"]
    unavailable = [
        {"name": name, "available": False, "reason": "Workbook tab is unavailable"}
        for name in expected if name not in names
    ]
    output = {
        "sourceFile": path.split("/")[-1],
        "sourceId": source_id,
        "tabs": source_tabs,
        "rawTabs": raw_tabs,
        "availableTabs": names,
        "unavailableLookups": unavailable,
        "canonicalMetadata": {
            "sourceId": source_id,
            "sourceFile": path.split("/")[-1],
            "canonicalSource": bool(re.search(r"Indexes[_ -]*8[-_]2026", path, re.I)),
            "sourcePolicy": "verified-August-2026-preferred; no v10 mixing",
            "availableTabs": names,
            "unavailableLookups": [item["name"] for item in unavailable],
        },
    }
    print(
        json.dumps(
            output,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main(sys.argv[1])