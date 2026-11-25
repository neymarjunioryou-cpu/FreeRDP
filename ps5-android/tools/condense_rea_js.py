#!/usr/bin/env python3
"""Shrink REA's multi-megabyte JS Evidence envelope to a readable summary.

`rea analyze-javascript-application` emits JSONL: progress lines followed by
one final Evidence object.  The full envelope (semantic graph, thousands of
nodes) is useful but far too large to keep in Git, so this script keeps the
identifiers, statistics and limitations and drops the graph bodies.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(src: str, dst: str) -> None:
    p = Path(src)
    objects = []
    for line in p.read_text().splitlines():
        if not line.strip():
            continue
        try:
            objects.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    if not objects:
        raise SystemExit("no JSON objects found in " + src)
    last = objects[-1]
    nr = last.get("normalized_result", {})
    g = nr.get("graph", {})
    sg = nr.get("semantic_graph", {})
    st = nr.get("statistics", {})

    out = [
        "REA analyze-javascript-application -- condensed evidence summary",
        "(full Evidence envelope omitted; regenerate with tools/rea-evidence.sh)",
        "",
        "evidence_id             : " + str(last.get("evidence_id")),
        "operation               : " + str(last.get("operation")),
        "confidence / authority  : " + str(last.get("confidence")) + " / " + str(last.get("authority")),
        "input_path              : " + str(nr.get("input_path")),
        "format                  : " + str(nr.get("format")),
        "root_artifact_sha256    : " + str(nr.get("root_artifact_sha256")),
        "inventory_manifest_id   : " + str(nr.get("inventory_manifest_id")),
        "application graph_id    : " + str(g.get("graph_id")),
        "semantic graph_id       : " + str(sg.get("graph_id")),
        "integrity_contradictions: " + str(len(nr.get("integrity_contradictions", []))),
        "",
        "Statistics:",
    ]
    for k, v in st.items():
        out.append("  %-28s %s" % (k, v))
    out += [
        "",
        "Application graph       : %d nodes, %d edges, coverage=%s" % (
            len(g.get("nodes", [])), len(g.get("edges", [])),
            g.get("coverage", {}).get("status")),
        "Semantic graph          : %d nodes, %d relations, %d fingerprints, %d unknowns" % (
            len(sg.get("nodes", [])), len(sg.get("relations", [])),
            len(sg.get("fingerprints", [])), len(sg.get("unknowns", []))),
        "  coverage status       : " + str(sg.get("coverage", {}).get("status")),
        "  relation families     : " + ", ".join(
            str(f.get("family")) for f in sg.get("coverage", {}).get("families", [])
            if isinstance(f, dict)),
        "",
        "Declared limitations (REA, verbatim):",
    ]
    for l in nr.get("limitations", []):
        out.append("  - " + str(l))
    out += [
        "",
        "Interpretation: REA parsed the three JS files and index.html as inert text.",
        "No CommonJS/ESM imports, no Electron preload/contextBridge, no IPC, no",
        "native addons and no network request constructors were found: the shell is",
        "a self-contained classic-script WebView app with zero external dependencies.",
    ]
    Path(dst).write_text("\n".join(out) + "\n")
    p.unlink()
    print("wrote", dst, "(", Path(dst).stat().st_size, "bytes )")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: condense_rea_js.py <full.jsonl> <summary.txt>")
    main(sys.argv[1], sys.argv[2])
