import { StateMeta } from '../types';

export function generatePythonExportScript(
  selectedStates: StateMeta[],
  servers: string[],
  includePlanned = true,
  includeLinks = true,
  politenessDelaySeconds = 5
): string {
  const statesJson = JSON.stringify(
    selectedStates.map((s) => ({
      code: s.code,
      name: s.name,
      iso: s.iso,
      altCodes: s.altCodes || [],
      fallbackName: s.fallbackName || s.name,
    })),
    null,
    2
  );

  const serversJson = JSON.stringify(servers, null, 2);

  return `#!/usr/bin/env python3
"""
India Roads -> KMZ / KML Exporter (Standalone Python Client)
Generated for OpenStreetMap Overpass API
Data (c) OpenStreetMap contributors (ODbL)

Requirements:
    pip install requests

Usage:
    python3 export_india_roads.py
"""

import os
import sys
import time
import json
import urllib.parse
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

# Configured States to Download
STATES = ${statesJson}

# Overpass API Servers with automatic failover
SERVERS = ${serversJson}

POLITENESS_DELAY_SECS = ${politenessDelaySeconds}
INCLUDE_PLANNED = ${includePlanned ? 'True' : 'False'}
INCLUDE_LINKS = ${includeLinks ? 'True' : 'False'}

# KML Color Schema (aabbggrr format)
CATEGORY_STYLES = {
    "motorway": {"name": "Motorway", "color": "ff00c800", "width": "3", "desc": "highway=motorway"},
    "expressway": {"name": "Expressway", "color": "ffffff00", "width": "3", "desc": "highway=trunk + expressway=yes"},
    "link": {"name": "Link / Ramp", "color": "ff78aa00", "width": "2", "desc": "highway=motorway_link"},
    "construction": {"name": "Under construction", "color": "ff008cff", "width": "3", "desc": "highway=construction"},
    "proposed": {"name": "Proposed", "color": "ffff6400", "width": "3", "desc": "highway=proposed"},
}

def classify_tags(tags):
    if not tags:
        return None
    hw = tags.get("highway", "")
    exp = tags.get("expressway", "")
    c_hw = tags.get("construction", "")
    p_hw = tags.get("proposed", "")

    if hw == "motorway":
        return "motorway"
    if hw == "motorway_link" and INCLUDE_LINKS:
        return "link"
    if hw == "trunk" and (exp == "yes" or tags.get("motorroad") == "yes"):
        return "expressway"
    if hw == "expressway":
        return "expressway"
    if INCLUDE_PLANNED:
        if hw == "construction" and (c_hw == "motorway" or (c_hw == "trunk" and exp == "yes") or c_hw):
            return "construction"
        if hw == "proposed" and (p_hw == "motorway" or (p_hw == "trunk" and exp == "yes") or p_hw):
            return "proposed"
    return None

def build_main_query(iso_code, use_fallback_name=False, fallback_name=""):
    link_part = "|motorway_link" if INCLUDE_LINKS else ""
    if use_fallback_name and fallback_name:
        area_line = f'area["name:en"="{fallback_name}"]["boundary"="administrative"]["admin_level"="4"]->.a;'
    else:
        area_line = f'area["ISO3166-2"="{iso_code}"]->.a;'
    return f"""[out:json][timeout:120];
{area_line}
(
  way["highway"~"^(motorway{link_part})$"](area.a);
  way["highway"="trunk"]["expressway"="yes"](area.a);
);
out geom;"""

def build_planned_query(iso_code):
    return f"""[out:json][timeout:120];
area["ISO3166-2"="{iso_code}"]->.a;
(
  way["highway"="construction"]["construction"="motorway"](area.a);
  way["highway"="construction"]["construction"="trunk"]["expressway"="yes"](area.a);
  way["highway"="proposed"]["proposed"="motorway"](area.a);
  way["highway"="proposed"]["proposed"="trunk"]["expressway"="yes"](area.a);
);
out geom;"""

def fetch_overpass(query_str, state_name):
    import requests
    headers = {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    }
    data = "data=" + urllib.parse.quote(query_str)

    for attempt, server in enumerate(SERVERS * 2):
        print(f"  -> [{state_name}] Querying {server} (attempt {attempt+1})...")
        try:
            resp = requests.post(server, data=data, headers=headers, timeout=150)
            if resp.status_code == 200:
                json_data = resp.json()
                if "remark" in json_data and ("timeout" in json_data["remark"].lower() or "runtime error" in json_data["remark"].lower()):
                    print(f"     [!] Overpass remark: {json_data['remark']}")
                    time.sleep(10)
                    continue
                ways = [el for el in json_data.get("elements", []) if el.get("type") == "way" and el.get("geometry")]
                return ways
            elif resp.status_code in (429, 504, 502, 503):
                retry_after = int(resp.headers.get("Retry-After", 20))
                print(f"     [!] HTTP {resp.status_code}. Backing off for {retry_after}s...")
                time.sleep(retry_after)
            else:
                print(f"     [!] HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            print(f"     [!] Connection failed on {server}: {e}")
        time.sleep(5)
    return []

def generate_kml_file(state_name, ways, output_path):
    # Categorise ways
    categorised = {k: [] for k in CATEGORY_STYLES.keys()}
    for w in ways:
        cat = classify_tags(w.get("tags", {}))
        if cat and cat in categorised:
            categorised[cat].append(w)

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<kml xmlns="http://www.opengis.net/kml/2.2">')
    lines.append('  <Document>')
    lines.append(f'    <name>{escape(state_name)} Motorways &amp; Expressways</name>')
    lines.append(f'    <description>(c) OpenStreetMap contributors (ODbL) - Downloaded {time.strftime("%Y-%m-%d")}</description>')

    # Shared Styles
    for cat_id, meta in CATEGORY_STYLES.items():
        lines.append(f'    <Style id="style_{cat_id}">')
        lines.append('      <LineStyle>')
        lines.append(f'        <color>{meta["color"]}</color>')
        lines.append(f'        <width>{meta["width"]}</width>')
        lines.append('      </LineStyle>')
        lines.append('    </Style>')

    # Folders per category
    for cat_id, cat_ways in categorised.items():
        if not cat_ways:
            continue
        meta = CATEGORY_STYLES[cat_id]
        lines.append('    <Folder>')
        lines.append(f'      <name>{escape(meta["name"])} ({len(cat_ways)})</name>')
        lines.append(f'      <description>{escape(meta["desc"])}</description>')

        for way in cat_ways:
            tags = way.get("tags", {})
            way_id = way.get("id")
            name = tags.get("ref") or tags.get("name") or f"Way {way_id}"
            geom = way.get("geometry", [])
            coords_str = " ".join([f"{pt['lon']:.6f},{pt['lat']:.6f},0" for pt in geom])

            lines.append('      <Placemark>')
            lines.append(f'        <name>{escape(name)}</name>')
            lines.append(f'        <styleUrl>#style_{cat_id}</styleUrl>')
            lines.append('        <ExtendedData>')
            lines.append(f'          <Data name="osm_id"><value>{way_id}</value></Data>')
            lines.append(f'          <Data name="category"><value>{cat_id}</value></Data>')
            for k, v in tags.items():
                lines.append(f'          <Data name="{escape(k)}"><value>{escape(str(v))}</value></Data>')
            lines.append('        </ExtendedData>')
            lines.append('        <LineString>')
            lines.append('          <tessellate>1</tessellate>')
            lines.append(f'          <coordinates>{coords_str}</coordinates>')
            lines.append('        </LineString>')
            lines.append('      </Placemark>')

        lines.append('    </Folder>')

    lines.append('  </Document>')
    lines.append('</kml>')

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\\n".join(lines))
    print(f"  [+] Saved KML: {output_path} ({len(ways)} total ways)")

def main():
    out_dir = "india_roads_kml_output"
    os.makedirs(out_dir, exist_ok=True)
    print(f"=== Starting India Roads OSM Overpass Downloader ({len(STATES)} states) ===")

    for i, state in enumerate(STATES):
        state_code = state["code"]
        state_name = state["name"]
        print(f"\\n[{i+1}/{len(STATES)}] Processing {state_name} ({state_code})...")

        # 1. Main Query
        q_main = build_main_query(state["iso"])
        ways = fetch_overpass(q_main, state_name)

        # 2. Fallbacks if 0 ways found
        if not ways and state.get("altCodes"):
            for alt in state["altCodes"]:
                print(f"  [*] Trying alternative ISO code: {alt}...")
                q_alt = build_main_query(alt)
                ways = fetch_overpass(q_alt, state_name)
                if ways:
                    break

        if not ways and state.get("fallbackName"):
            print(f"  [*] Trying name fallback: {state['fallbackName']}...")
            q_name = build_main_query(state["iso"], use_fallback_name=True, fallback_name=state["fallbackName"])
            ways = fetch_overpass(q_name, state_name)

        # 3. Planned Query
        if INCLUDE_PLANNED:
            time.sleep(POLITENESS_DELAY_SECS)
            q_plan = build_planned_query(state["iso"])
            plan_ways = fetch_overpass(q_plan, state_name)
            seen_ids = set(w["id"] for w in ways)
            for pw in plan_ways:
                if pw["id"] not in seen_ids:
                    ways.append(pw)
                    seen_ids.add(pw["id"])

        # 4. Generate KML
        clean_name = state_name.replace(" ", "_").replace("/", "_")
        kml_file = os.path.join(out_dir, f"{state_code}_{clean_name}_roads.kml")
        generate_kml_file(state_name, ways, kml_file)

        # Politeness Delay
        print(f"  [*] Sleeping {POLITENESS_DELAY_SECS}s to respect public Overpass servers...")
        time.sleep(POLITENESS_DELAY_SECS)

    print(f"\\n=== Complete! All KML files are in '{out_dir}/' ===")

if __name__ == "__main__":
    main()
`;
}
