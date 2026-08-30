"""Regression checks for the stdlib XLSX index parser."""
import json
import hashlib
import pathlib
import subprocess
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
PARSER = pathlib.Path(__file__).with_name("read-index-workbook.py")
ASSETS = ROOT / "attached_assets"


def parse(name):
    result = subprocess.run(
        [sys.executable, str(PARSER), str(ASSETS / name)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


class ParserRegression(unittest.TestCase):
    def test_august_shape_and_canonical_aliases(self):
        data = parse("Indexes_8-2026_1788042416904.xlsx")
        self.assertIn("Brokerages", data["availableTabs"])
        self.assertIn("Agents", data["availableTabs"])
        self.assertIn("Sales reps", data["availableTabs"])
        self.assertEqual(data["tabs"][1]["rows"][0]["License Eff Date"], "2025-01-21")
        self.assertTrue(data["rawTabs"])
        self.assertTrue(data["sourceId"].startswith("sha256:"))

    def test_v10_is_not_august_and_absent_tables_are_explicit(self):
        data = parse("Indexes_v10_1787946054974.xlsx")
        self.assertFalse(data["canonicalMetadata"]["canonicalSource"])
        self.assertIn("Brokerages", {item["name"] for item in data["unavailableLookups"]})
        agent = next(tab for tab in data["tabs"] if tab["name"] == "Agent")
        self.assertIn("ID", agent["rows"][0])
        self.assertIn("License Number", agent["rows"][0])

    def test_byte_identical_august_sources_share_provenance_but_v10_does_not(self):
        august = sorted(ASSETS.glob("Indexes_8-2026_*.xlsx"))
        self.assertGreaterEqual(len(august), 2)
        august_ids = {
            hashlib.sha256(path.read_bytes()).hexdigest()
            for path in august
        }
        self.assertEqual(len(august_ids), 1)
        v10 = ASSETS / "Indexes_v10_1787946054974.xlsx"
        self.assertNotIn(hashlib.sha256(v10.read_bytes()).hexdigest(), august_ids)


if __name__ == "__main__":
    unittest.main()