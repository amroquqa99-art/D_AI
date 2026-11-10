import csv
import io
import tempfile
import unittest
from pathlib import Path

from dai.analysis_tools import calculate_decimal, summarize_csv, extract_pdf, crossref_search
from dai.errors import InvalidRequest


class AnalysisToolsTests(unittest.TestCase):
    def test_calculate_decimal_operations(self):
        self.assertEqual(calculate_decimal("sum", ["1.1", "2.2"])["result"], "3.3")
        self.assertEqual(calculate_decimal("mean", ["2", "4"])["result"], "3")
        self.assertEqual(calculate_decimal("quotient", ["10", "4"])["result"], "2.5")
        self.assertEqual(calculate_decimal("sqrt", ["9"])["result"], "3")
        with self.assertRaises(InvalidRequest):
            calculate_decimal("quotient", ["1", "0"])
        with self.assertRaises(InvalidRequest):
            calculate_decimal("bogus", ["1"])

    def test_summarize_csv(self):
        text = "a,b\n1,2\n3,4\n5,6"
        res = summarize_csv(text)
        self.assertEqual(res["rows"], 3)
        self.assertEqual(res["columns"][0]["name"], "a")
        self.assertEqual(res["columns"][0]["numeric_count"], 3)
        self.assertEqual(res["columns"][0]["mean"], 3.0)

    def test_extract_pdf_rejects_non_pdf_and_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "secret.pdf").write_text("x")
            # non-pdf
            (root / "note.txt").write_text("x")
            with self.assertRaises(InvalidRequest):
                extract_pdf(root, "note.txt")
            # traversal
            with self.assertRaises(InvalidRequest):
                extract_pdf(root, "../etc/passwd")

    def test_crossref_search_validates_input(self):
        with self.assertRaises(InvalidRequest):
            crossref_search("")
        with self.assertRaises(InvalidRequest):
            crossref_search("q", rows=0)


if __name__ == "__main__":
    unittest.main()