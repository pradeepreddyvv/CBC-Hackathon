#!/usr/bin/env python3
"""
Parse LinkedIn scrape data (obfuscated Apify export) into clean job list.

Input:  untitled folder/linkedin-2026-03-21.json (43 entries with obfuscated fields)
Output: linkedin_manual_jobs.json (unique jobs, clean format)

Field mapping:
  _1e44902d href  → job URLs (contain currentJobId=XXXX)
  _8086a48b       → alternating: title (Verified job), posted date
  fd835fbb        → blocks of: title, company, location, Saved, [salary/alumni/...], time_ago
  a1bd271f src    → images (company logos have 'company-logo' in URL)
"""

import json, re, sys
from datetime import datetime
from pathlib import Path

INPUT_FILE = Path(__file__).parent / "untitled folder" / "linkedin-2026-03-21.json"
OUTPUT_FILE = Path(__file__).parent / "linkedin_manual_jobs.json"

TIME_AGO_RE = re.compile(r'^\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$')
SALARY_RE = re.compile(r'^\$[\d,.]+')


def parse_posted_date(text):
    """Parse 'Posted on March 12, 2026, 8:40 AM' → ISO datetime."""
    if not text:
        return None
    m = re.search(r'Posted on (.+)', text)
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1).strip(), "%B %d, %Y, %I:%M %p").isoformat()
    except ValueError:
        return None


def clean_title(title):
    """Strip '(Verified job)' suffix."""
    if not title:
        return ""
    return re.sub(r'\s*\(Verified job\)\s*$', '', title).strip()


def extract_sorted(entry, base_key):
    """Extract values for a base key, sorted by index."""
    items = []
    for k, v in entry.items():
        if base_key not in k:
            continue
        m = re.match(r'^(.+?)(?:\s+\((\d+)\))?$', k)
        if m and m.group(1) == base_key:
            idx = int(m.group(2)) if m.group(2) else 1
            items.append((idx, v))
    items.sort(key=lambda x: x[0])
    return [v for _, v in items]


def parse_entry(entry):
    """Parse one search results page entry into a list of jobs."""
    # 1. Extract job IDs from href fields
    hrefs = extract_sorted(entry, '_1e44902d href')
    if not hrefs:
        return []

    job_ids = []
    for href in hrefs:
        m = re.search(r'currentJobId=(\d+)', str(href or ''))
        if m:
            job_ids.append(m.group(1))
        else:
            job_ids.append(None)

    # 2. Extract titles and posted dates from _8086a48b (alternating: title, posted)
    tags = extract_sorted(entry, '_8086a48b')
    titles = []
    posted_dates = []
    for t in tags:
        if t and 'Posted on' in str(t):
            posted_dates.append(parse_posted_date(t))
        elif t:
            titles.append(clean_title(t))

    # 3. Extract fd835fbb values and split into blocks at time_ago boundaries
    fd_vals = extract_sorted(entry, 'fd835fbb')
    blocks = []
    current_block = []
    for val in fd_vals:
        s = (val or '').strip()
        current_block.append(s)
        if TIME_AGO_RE.match(s):
            blocks.append(current_block)
            current_block = []
    if current_block:
        blocks.append(current_block)  # last block may lack time_ago

    # 4. Extract company logos
    imgs = extract_sorted(entry, 'a1bd271f src')
    logos = [u for u in imgs if u and 'company-logo' in str(u)]

    # 5. Build jobs from blocks
    jobs = []
    for i in range(len(job_ids)):
        job_id = job_ids[i]
        if not job_id:
            continue

        title = titles[i] if i < len(titles) else ""
        posted = posted_dates[i] if i < len(posted_dates) else None
        logo = logos[i] if i < len(logos) else ""

        # Parse block: [title, company, location, "Saved", ...]
        block = blocks[i] if i < len(blocks) else []

        company = ""
        location = ""
        salary = ""

        if len(block) >= 3:
            # block[0] = title (skip), block[1] = company, block[2] = location
            company = block[1]
            location = block[2] if block[2] != "Saved" else ""

            # Scan remaining for salary
            for val in block[3:]:
                if SALARY_RE.match(val):
                    salary = val
                    break

        # Clean company: strip trailing numbers like "TikTok 2"
        company = re.sub(r'\s+\d+$', '', company).strip()

        # Skip if company is garbage
        if company in ('Saved', 'Save', '·', '•', '', 'Be an early applicant'):
            # Try to recover from block structure
            if len(block) >= 4 and block[1] not in ('Saved', '·', '•', ''):
                company = block[1]
            else:
                company = ""

        if not title and not company:
            continue

        jobs.append({
            "job_id": job_id,
            "title": title,
            "company": company,
            "location": location,
            "url": f"https://www.linkedin.com/jobs/view/{job_id}/",
            "link": f"https://www.linkedin.com/jobs/view/{job_id}/",
            "postedAt": posted,
            "salary": salary,
            "logo_url": logo,
            "source": "linkedin_manual",
            "description": "",
        })

    return jobs


def main():
    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE) as f:
        data = json.load(f)
    print(f"  → {len(data)} entries")

    all_jobs = []
    seen_ids = set()
    skipped = 0

    for i, entry in enumerate(data):
        try:
            jobs = parse_entry(entry)
            for j in jobs:
                if j["job_id"] in seen_ids:
                    skipped += 1
                    continue
                seen_ids.add(j["job_id"])
                all_jobs.append(j)
        except Exception as e:
            print(f"  [entry {i}] Error: {e}")

    # Remove jobs with empty or invalid company names
    JUNK_PATTERNS = [
        r'^\d+\s+(company|school|connections?)\s+(alumni|work)',
        r'^(Saved?|Viewed|Easy Apply|Be an early applicant)$',
        r'^·$', r'^•$', r'^\d+$',
        r'^(Remote|On-site|Hybrid)$',
        r'^\$[\d,.]+',  # salary
        r'.*\b(intern|engineer|developer|software|summer|2026|spring|fall)\b.*',  # job titles
        r'^Medical benefit$',
    ]
    JUNK_RE = [re.compile(p, re.IGNORECASE) for p in JUNK_PATTERNS]
    # Location pattern: "City, ST" or "City, ST (On-site/Hybrid/Remote)"
    LOCATION_RE = re.compile(r'^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}\b')

    def is_valid_company(c):
        if not c or len(c) < 2:
            return False
        for pat in JUNK_RE:
            if pat.match(c):
                return False
        if LOCATION_RE.match(c):
            return False
        return True

    valid_jobs = [j for j in all_jobs if is_valid_company(j["company"])]
    bad_company = len(all_jobs) - len(valid_jobs)

    print(f"  → {len(all_jobs)} unique jobs ({skipped} duplicates skipped)")
    print(f"  → {bad_company} jobs with empty company (removed)")
    print(f"  → {len(valid_jobs)} clean jobs")

    # Stats
    companies = {}
    for j in valid_jobs:
        companies[j["company"]] = companies.get(j["company"], 0) + 1
    top = sorted(companies.items(), key=lambda x: -x[1])[:20]
    print(f"\n  Top companies ({len(companies)} unique):")
    for c, n in top:
        print(f"    {c}: {n} jobs")

    with_salary = sum(1 for j in valid_jobs if j["salary"])
    with_posted = sum(1 for j in valid_jobs if j["postedAt"])
    print(f"\n  With salary: {with_salary}")
    print(f"  With posted date: {with_posted}")

    # Save
    print(f"\nSaving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(valid_jobs, f, indent=2)
    print(f"  ✅ {len(valid_jobs)} jobs saved")

    return valid_jobs


if __name__ == "__main__":
    main()
