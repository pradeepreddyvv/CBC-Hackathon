#!/usr/bin/env python3
"""
Upload generated docs from pipeline_output.json to n8n job-docs store.
Run this after generate_job_docs.py completes.

Usage:
  python3 upload_docs_to_n8n.py
  python3 upload_docs_to_n8n.py --file path/to/pipeline_output.json
"""

import json, os, argparse, requests

N8N_BASE = os.environ.get("N8N_BASE", "http://localhost:5678")
DEFAULT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_docs", "pipeline_output.json")


def main():
    parser = argparse.ArgumentParser(description="Upload generated docs to n8n")
    parser.add_argument("--file", default=DEFAULT_FILE, help="Pipeline output JSON file")
    args = parser.parse_args()

    print(f"Loading {args.file}...")
    with open(args.file) as f:
        data = json.load(f)

    # Flatten all docs into {job_key: doc} map
    docs = {}
    for source_name, roles in data.get("sources", {}).items():
        for role_name, job_list in roles.items():
            for job in job_list:
                if "error" in job:
                    continue
                key = job.get("job_key", "")
                if key:
                    doc = {}
                    for field in [
                        "title", "company", "score", "role_category", "source",
                        "url", "location", "posted_at",
                        "resume_text", "resume_latex", "cover_letter",
                        "outreach", "connections", "has_connections",
                        "company_research", "follow_up", "interview_prep",
                        "ats_audit", "multi_score", "generated_at",
                    ]:
                        if field in job and job[field] is not None:
                            doc[field] = job[field]
                    docs[key] = doc

    print(f"  → {len(docs)} docs to upload")

    if not docs:
        print("  No docs to upload.")
        return

    # Upload in bulk
    print(f"Uploading to {N8N_BASE}/webhook/job-docs-upload...")
    resp = requests.post(
        f"{N8N_BASE}/webhook/job-docs-upload",
        json={"bulk": True, "docs": docs},
        timeout=60,
        headers={"Content-Type": "application/json"}
    )
    resp.raise_for_status()
    result = resp.json()
    print(f"  ✅ Uploaded! Total docs in store: {result.get('total_docs', '?')}")
    print(f"  Updated at: {result.get('updated_at', '?')}")


if __name__ == "__main__":
    main()
