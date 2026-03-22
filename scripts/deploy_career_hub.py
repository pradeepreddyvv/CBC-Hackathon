#!/usr/bin/env python3
"""Deploy the Career Hub v2 HTML to n8n workflow."""

import json, os, requests, sys

N8N_BASE = os.environ.get("N8N_BASE", "http://localhost:5678")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")
HEADERS = {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}
WORKFLOW_ID = os.environ.get("N8N_CAREER_HUB_WORKFLOW_ID", "QFs7q2WxKKbux1Mq")
HTML_FILE = os.environ.get("CAREER_HUB_HTML", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "career_hub_v2.html"))

def main():
    print("Reading HTML file...")
    with open(HTML_FILE) as f:
        html = f.read()
    print(f"  → {len(html)} chars")

    # Escape for JS string literal
    js_html = html.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '')
    code = f'const html = "{js_html}";\nreturn [{{ json: {{ html }} }}];'

    print(f"  → JS code: {len(code)} chars")

    # Get current workflow
    print("Fetching current workflow...")
    resp = requests.get(f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}", headers=HEADERS)
    resp.raise_for_status()
    workflow = resp.json()

    # Update the Return HTML node
    for node in workflow.get("nodes", []):
        if node["name"] == "Return HTML":
            node["parameters"]["jsCode"] = code
            print("  → Updated Return HTML node")
            break

    # Deactivate first
    print("Deactivating workflow...")
    try:
        requests.post(f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}/deactivate", headers=HEADERS)
    except:
        pass

    # Update workflow
    print("Updating workflow...")
    resp = requests.put(
        f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}",
        json={
            "name": workflow["name"],
            "nodes": workflow["nodes"],
            "connections": workflow["connections"],
            "settings": workflow.get("settings", {}),
            "staticData": workflow.get("staticData")
        },
        headers=HEADERS
    )
    resp.raise_for_status()
    print(f"  → Updated")

    # Activate
    print("Activating workflow...")
    resp = requests.post(f"{N8N_BASE}/api/v1/workflows/{WORKFLOW_ID}/activate", headers=HEADERS)
    resp.raise_for_status()
    print(f"  → Active: {resp.json().get('active', '?')}")

    print(f"\n✅ Career Hub UI deployed: {N8N_BASE}/webhook/career-hub")

if __name__ == "__main__":
    main()
