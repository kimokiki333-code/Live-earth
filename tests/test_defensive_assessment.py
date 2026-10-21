"""Smoke tests for the Badr Live Earth defensive layer (no live scanning)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
import server

client = TestClient(server.app)


def test_health_states_gauge_semantics():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Badr Live Earth"
    assert body["gauge_semantics"] == "checklist_evidence_coverage"
    assert "not a percentage" in body["disclaimer"].lower()


def test_checklist_endpoint():
    r = client.get("/api/assessment/checklist")
    assert r.status_code == 200
    body = r.json()
    assert body["assessment"]["total_count"] == len(server.DEFENSIVE_CHECKLIST) == 8
    assert 0 <= body["assessment"]["coverage_percent"] <= 100


def test_scan_requires_authorization():
    r = client.post("/api/scan/run", json={"target": "example.com", "module_ids": ["115"]})
    assert r.status_code == 403


def test_private_and_local_targets_blocked():
    for target in ("127.0.0.1", "localhost", "192.168.1.10", "10.0.0.5", "[::1]"):
        r = client.post("/api/scan/run", json={
            "target": target, "module_ids": ["115"], "authorized": True})
        assert r.status_code == 400, target


def test_coverage_counts_matched_modules_only():
    a = server.compute_assessment(
        [{"module": "SSL Chain Analysis"}, {"module": "DNS Records"}])
    assert a["covered_count"] == 2
    assert a["coverage_percent"] == 25
    empty = server.compute_assessment([])
    assert empty["covered_count"] == 0 and empty["coverage_percent"] == 0
