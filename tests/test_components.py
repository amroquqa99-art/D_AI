from __future__ import annotations

from pathlib import Path
import json
import tempfile
import unittest

from dai.components import ComponentRegistry, DECISIONS, KNOWN_CONTRACT_NAMES
from dai.contracts import Principal, Scope
from dai.errors import AccessDenied, Conflict, InvalidRequest, NotFound
from dai.memory import MemoryStore


class ComponentRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dai-components-")
        self.store = MemoryStore(Path(self.tmp.name) / "state")
        self.owner = Principal("owner")
        self.other = Principal("other")
        self.scope = self.store.create_project(self.owner, "the-component-project")
        self.registry = ComponentRegistry(self.store)
        self.component = self.registry.propose(
            self.owner, self.scope,
            source_url="https://github.com/acme/example-repo",
            name="example component",
            patterns=["pattern-based git flow", "contract-first design"],
            notes="an external component proposal",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def _count_everything(self) -> int:
        total = 0
        for plane in ("person", "project", "global"):
            with self.store._db(plane) as db:
                total += db.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        with self.store._db("project") as db:
            for table in ("component_index", "component_idempotency",
                          "component_versions"):
                total += db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        return total

    def _root(self) -> Path:
        from dai import components
        return Path(components.__file__).resolve().parents[2]

    def test_propose_records_component_and_index_row(self):
        self.assertEqual(self.component.kind, "component")
        self.assertEqual(self.component.content["name"], "example component")
        self.assertEqual(self.component.content["license"], "UNKNOWN")
        self.assertEqual(self.component.content["source_url"],
                         "https://github.com/acme/example-repo")
        self.assertEqual(self.component.content["patterns"],
                         ["pattern-based git flow", "contract-first design"])
        self.assertEqual(self.component.content["decision"], None)
        self.assertEqual(self.component.version, 1)
        with self.store._db("project") as db:
            row = db.execute(
                "SELECT license, decision FROM component_index WHERE component_id=?",
                (self.component.id,)).fetchone()
            self.assertEqual((row[0], row[1]), ("UNKNOWN", None))
            version = db.execute(
                "SELECT version FROM component_versions WHERE name='components'").fetchone()
            self.assertEqual(version[0], 1)

    def test_propose_requires_project_scope(self):
        with self.assertRaises(InvalidRequest):
            self.registry.propose(self.owner, Scope("person", "owner"),
                                  source_url="https://github.com/acme/repo",
                                  name="x", patterns=["pattern one here"])

    def test_outsider_cannot_propose(self):
        with self.assertRaises(AccessDenied):
            self.registry.propose(self.other, self.scope,
                                  source_url="https://github.com/acme/repo",
                                  name="x", patterns=["pattern one here"])

    def test_source_url_must_be_github_owner_repo(self):
        for bad in ("http://github.com/acme/repo",
                    "https://gitlab.com/acme/repo",
                    "https://github.com/acme/",
                    "https://github.com/acme/repo/sub",
                    "https://github.com/acme/repo?x=1",
                    "github.com/acme/repo",
                    "not-a-url",
                    ""):
            with self.subTest(source_url=bad):
                with self.assertRaises(InvalidRequest):
                    self.registry.propose(self.owner, self.scope,
                                          source_url=bad, name="x",
                                          patterns=["pattern one here"])
        for good in ("https://github.com/acme/repo", "https://github.com/acme/repo/"):
            record = self.registry.propose(self.owner, self.scope,
                                           source_url=good, name=f"x {good}",
                                           patterns=["pattern one here"])
            self.assertEqual(record.content["source_url"], good)
        for bad in ("https://github.com/acme/repo?x=1",):
            with self.subTest(source_url=bad):
                with self.assertRaises(InvalidRequest):
                    self.registry.propose(self.owner, self.scope,
                                          source_url=bad, name="x",
                                          patterns=["pattern one here"])

    def test_patterns_must_be_concrete_and_at_least_12_characters(self):
        with self.assertRaises(InvalidRequest):
            self.registry.propose(self.owner, self.scope,
                                  source_url="https://github.com/acme/repo",
                                  name="x", patterns=[])
        with self.assertRaises(InvalidRequest):
            self.registry.propose(self.owner, self.scope,
                                  source_url="https://github.com/acme/repo",
                                  name="x", patterns=["short"])
        with self.assertRaises(InvalidRequest):
            self.registry.propose(self.owner, self.scope,
                                  source_url="https://github.com/acme/repo",
                                  name="x", patterns=["not a list"])
        record = self.registry.propose(self.owner, self.scope,
                                       source_url="https://github.com/acme/repo",
                                       name="x", patterns=["pattern one here"])
        self.assertEqual(record.content["patterns"], ["pattern one here"])

    def test_unknown_licence_refuses_adopt_pattern(self):
        unknown = self.registry.propose(self.owner, self.scope,
                                        source_url="https://github.com/acme/unknown-lic",
                                        name="unknown licence",
                                        patterns=["pattern one here"],
                                        license="UNKNOWN")
        with self.assertRaises(InvalidRequest) as raised:
            self.registry.decide(self.owner, self.scope, unknown.id,
                                 decision="ADOPT_PATTERN", rationale="r",
                                 expected_version=1)
        self.assertIn("ADOPT_PATTERN", str(raised.exception))
        self.assertIn("UNKNOWN", str(raised.exception))
        # An unknown-licence proposal may be ADOPT_PATTERN_AFTER_X,
        # REFERENCE_ONLY or REJECT (one decision per component).
        for decision in ("ADOPT_PATTERN_AFTER_X", "REFERENCE_ONLY", "REJECT"):
            component = self.registry.propose(self.owner, self.scope,
                                              source_url=f"https://github.com/acme/unknown-{decision.lower()}",
                                              name=decision,
                                              patterns=["pattern one here"],
                                              license="UNKNOWN")
            record = self.registry.decide(self.owner, self.scope, component.id,
                                          decision=decision, rationale="owner legal review",
                                          expected_version=1)
            self.assertEqual(record.content["decision"], decision)
            self.assertEqual(record.content["rationale"], "owner legal review")
        # A CONFLICT licence refuses ADOPT_PATTERN too.
        conflict = self.registry.propose(self.owner, self.scope,
                                         source_url="https://github.com/acme/conflict-lic",
                                         name="conflict licence",
                                         patterns=["pattern one here"],
                                         license="CONFLICT")
        with self.assertRaises(InvalidRequest):
            self.registry.decide(self.owner, self.scope, conflict.id,
                                 decision="ADOPT_PATTERN", rationale="r",
                                 expected_version=1)

    def test_known_licence_allows_adopt_pattern(self):
        mit = self.registry.propose(self.owner, self.scope,
                                    source_url="https://github.com/acme/mit",
                                    name="mit",
                                    patterns=["pattern one here"],
                                    license="MIT")
        record = self.registry.decide(self.owner, self.scope, mit.id,
                                      decision="ADOPT_PATTERN", rationale="r",
                                      expected_version=1)
        self.assertEqual(record.content["decision"], "ADOPT_PATTERN")

    def test_decision_is_version_fenced_and_one_per_component(self):
        record = self.registry.decide(self.owner, self.scope, self.component.id,
                                      decision="REFERENCE_ONLY",
                                      rationale="read only, no licence yet",
                                      expected_version=1)
        self.assertEqual(record.version, 2)
        # The same decision again returns the same record.
        again = self.registry.decide(self.owner, self.scope, self.component.id,
                                     decision="REFERENCE_ONLY",
                                     rationale="read only, no licence yet",
                                     expected_version=2)
        self.assertEqual(again.id, record.id)
        self.assertEqual(again.version, 2)
        # A different decision raises Conflict.
        with self.assertRaises(Conflict):
            self.registry.decide(self.owner, self.scope, self.component.id,
                                 decision="ADOPT_PATTERN_AFTER_X", rationale="r",
                                 expected_version=2)
        # A stale expected_version raises Conflict.
        with self.assertRaises(Conflict):
            self.registry.decide(self.owner, self.scope, self.component.id,
                                 decision="REJECT", rationale="r",
                                 expected_version=1)
        self.assertEqual(self.registry.get(self.owner, self.scope,
                                           self.component.id).version, 2)

    def test_adopt_records_bindings_files_and_verification(self):
        self.registry.decide(self.owner, self.scope, self.component.id,
                             decision="ADOPT_PATTERN_AFTER_X", rationale="r",
                             expected_version=1)
        root = self._root()
        adopted = self.registry.adopt(self.owner, self.scope, self.component.id,
                                      capability_id="cap.component.registry",
                                      bindings={"pattern-based git flow": "task",
                                                "contract-first design": "component.registry"},
                                      files=["src/dai/components.py"],
                                      verification="grep registry calls in module",
                                      expected_version=2)
        self.assertEqual(adopted.content["capability_id"], "cap.component.registry")
        self.assertEqual(adopted.content["files"], ["src/dai/components.py"])
        self.assertEqual(adopted.content["adopted_by"], self.owner.id)
        with self.store._db("project") as db:
            row = db.execute(
                "SELECT decision FROM component_index WHERE component_id=?",
                (self.component.id,)).fetchone()
            self.assertEqual(row[0], "ADOPT_PATTERN_AFTER_X")

    def test_adopt_rejects_unknown_binding(self):
        self.registry.decide(self.owner, self.scope, self.component.id,
                             decision="REFERENCE_ONLY", rationale="r",
                             expected_version=1)
        with self.assertRaises(InvalidRequest) as raised:
            self.registry.adopt(self.owner, self.scope, self.component.id,
                                capability_id="cap.x",
                                bindings={"pattern one here": "not.a.contract"},
                                files=["src/dai/components.py"],
                                verification="v", expected_version=2)
        self.assertIn("known D_AI contract name", str(raised.exception))
        # Known bindings are accepted.
        for contract in KNOWN_CONTRACT_NAMES:
            record = self.registry.propose(self.owner, self.scope,
                                           source_url=f"https://github.com/acme/{contract}",
                                           name=contract,
                                           patterns=["pattern one here"])
            self.registry.decide(self.owner, self.scope, record.id,
                                 decision="REFERENCE_ONLY", rationale="r",
                                 expected_version=1)
            adopted = self.registry.adopt(self.owner, self.scope, record.id,
                                          capability_id="cap.x",
                                          bindings={"pattern one here": contract},
                                          files=["src/dai/components.py"],
                                          verification="v",
                                          expected_version=2)
            self.assertEqual(adopted.content["bindings"], { "pattern one here": contract })

    def test_adopt_rejects_file_escaping_dai_tree(self):
        self.registry.decide(self.owner, self.scope, self.component.id,
                             decision="REFERENCE_ONLY", rationale="r",
                             expected_version=1)
        root = self._root()
        bad = [
            str(root / "src" / "dai" / ".." / ".." / "etc" / "hostname"),
            "/etc/hostname",
            "../../../../etc/passwd",
            "../outside.txt",
            "src/../../outside.txt",
        ]
        for entry in bad:
            with self.subTest(entry=entry):
                with self.assertRaises(InvalidRequest):
                    self.registry.adopt(self.owner, self.scope, self.component.id,
                                        capability_id="cap.x",
                                        bindings={"pattern one here": "task"},
                                        files=[entry],
                                        verification="v", expected_version=2)
        # A URL file entry is rejected too: the external repo is never a dependency.
        with self.assertRaises(InvalidRequest):
            self.registry.adopt(self.owner, self.scope, self.component.id,
                                capability_id="cap.x",
                                bindings={"pattern one here": "task"},
                                files=["https://github.com/acme/repo/src/x.py"],
                                verification="v", expected_version=2)
        # A relative path inside the D_AI tree is accepted.
        adopted = self.registry.adopt(self.owner, self.scope, self.component.id,
                                      capability_id="cap.x",
                                      bindings={"pattern one here": "task"},
                                      files=["src/dai/components.py"],
                                      verification="v", expected_version=2)
        self.assertEqual(adopted.content["files"], ["src/dai/components.py"])

    def test_adopt_is_version_fenced(self):
        self.registry.decide(self.owner, self.scope, self.component.id,
                             decision="REFERENCE_ONLY", rationale="r",
                             expected_version=1)
        with self.assertRaises(Conflict):
            self.registry.adopt(self.owner, self.scope, self.component.id,
                                capability_id="cap.x",
                                bindings={"pattern one here": "task"},
                                files=["src/dai/components.py"],
                                verification="v", expected_version=1)

    def test_verify_reports_missing_file(self):
        self.registry.decide(self.owner, self.scope, self.component.id,
                             decision="ADOPT_PATTERN_AFTER_X", rationale="r",
                             expected_version=1)
        adopted = self.registry.adopt(self.owner, self.scope, self.component.id,
                                      capability_id="cap.component.registry",
                                      bindings={"pattern one here": "component.registry"},
                                      files=["src/dai/components.py", "no-such-file.txt"],
                                      verification="v", expected_version=2)
        result = self.registry.verify(self.owner, self.scope, self.component.id)
        self.assertEqual(set(result), {"ok", "missing"})
        self.assertFalse(result["ok"])
        self.assertIn("no-such-file.txt", result["missing"])
        # The same component with only existing files verifies clean.
        good = self.registry.propose(self.owner, self.scope,
                                     source_url="https://github.com/acme/good",
                                     name="good",
                                     patterns=["pattern one here"])
        self.registry.decide(self.owner, self.scope, good.id,
                             decision="REFERENCE_ONLY", rationale="r",
                             expected_version=1)
        self.registry.adopt(self.owner, self.scope, good.id,
                            capability_id="cap.y",
                            bindings={"pattern one here": "task"},
                            files=["src/dai/components.py"],
                            verification="v", expected_version=2)
        self.assertTrue(self.registry.verify(self.owner, self.scope, good.id)["ok"])

    def test_get_catalog_and_component_versions_guard(self):
        self.assertEqual(self.registry.get(self.owner, self.scope,
                                           self.component.id).id, self.component.id)
        with self.assertRaises(NotFound):
            self.registry.get(self.owner, self.scope, "no-such-component")
        catalog = self.registry.catalog(self.owner, self.scope)
        self.assertEqual(len(catalog), 1)
        self.assertEqual(catalog[0]["id"], self.component.id)
        self.assertEqual(catalog[0]["source"], "https://github.com/acme/example-repo")

    def test_from_manifest_loads_and_validates_entries(self):
        manifest_path = Path(self.tmp.name) / "manifest.json"
        manifest_path.write_text(json.dumps({
            "components": [
                {"id": "comp-a", "source": "https://github.com/acme/a",
                 "license": "MIT", "last_activity": "2026-01-01",
                 "decision": "REJECT",
                 "patterns": ["pattern one here", "another pattern two"],
                 "requirements": ["req one"], "abstraction": "lean",
                 "notes": "notes a"},
                {"id": "comp-b", "source": "https://github.com/acme/b/",
                 "patterns": ["pattern one here"]},
            ],
        }), encoding="utf-8")
        entries = ComponentRegistry.from_manifest(manifest_path)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["source_url"], "https://github.com/acme/a")
        self.assertEqual(entries[0]["license"], "MIT")
        self.assertEqual(entries[0]["commit"], "2026-01-01")
        self.assertEqual(entries[0]["decision"], "REJECT")
        self.assertEqual(entries[1]["source_url"], "https://github.com/acme/b/")
        self.assertEqual(entries[1]["license"], "UNKNOWN")
        # Through the normal propose path.
        records = ComponentRegistry.from_manifest(manifest_path, self.store,
                                                  self.owner, self.scope)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].kind, "component")
        self.assertEqual(records[0].content["license"], "MIT")
        with self.store._db("project") as db:
            row = db.execute(
                "SELECT COUNT(*) FROM component_index WHERE component_id IN (?,?)",
                (records[0].id, records[1].id)).fetchone()
            self.assertEqual(row[0], 2)

    def test_from_manifest_rejects_bad_entries(self):
        manifest_path = Path(self.tmp.name) / "bad.json"
        manifest_path.write_text(json.dumps({
            "components": [{"id": "x", "source": "not a github url",
                            "patterns": ["pattern one here"]}],
        }), encoding="utf-8")
        with self.assertRaises(InvalidRequest):
            ComponentRegistry.from_manifest(manifest_path)


if __name__ == "__main__":
    unittest.main()
