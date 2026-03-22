import os
import json
import httpx
from pathlib import Path
from dotenv import load_dotenv
from tinyfish import TinyFish

# Load .env.local
dotenv_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(dotenv_path)

# Load config
with open("config.json", "r") as f:
    config = json.load(f)

# Init TinyFish client
client = TinyFish(api_key=os.getenv("TINYFISH_API_KEY"))

print("TinyFish client ready")
print(f"Target: {config['company']} — {config['role']}")
print(f"Round type: {config['round_type']}")


# ── Helpers ───────────────────────────────────────────────────────────────────
def build_query(config):
    parts = [config["company"], config["role"], config["round_type"], "interview experience"]
    if config.get("job_description"):
        parts.append(config["job_description"][:100])
    return " ".join(parts)


def fetch_run_result(run_id):
    resp = httpx.get(
        f"https://agent.tinyfish.ai/v1/runs/{run_id}",
        headers={"X-API-Key": os.getenv("TINYFISH_API_KEY")}
    )
    return resp.json()


def run_agent(url, goal, source_name):
    print(f"\nScraping {source_name}...")
    print(f"   URL: {url}")
    result = {}
    with client.agent.stream(url=url, goal=goal) as stream:
        for event in stream:
            print(f"   Event: {event.type}")
            if event.type == "COMPLETE":
                run_data = fetch_run_result(event.run_id)
                result = run_data.get("result", {})
                break
    return result


def save_results(data, filename):
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved to {filepath}")


# ── Reddit ────────────────────────────────────────────────────────────────────
def scrape_reddit(config):
    q = build_query(config).replace(" ", "+")
    url = f"https://www.reddit.com/search/?q={q}&sort=relevance&t=year"
    goal = f"""
    On this Reddit search page for {config['company']} {config['role']} {config['round_type']} interviews:
    1. Find and extract the AI-generated summary at the top if available
    2. Extract the top 5 post titles and their short descriptions visible on the page
    Do NOT click into any posts or navigate away from this page.
    Return as JSON:
    {{
        "company": "{config['company']}",
        "role": "{config['role']}",
        "round_type": "{config['round_type']}",
        "source": "reddit",
        "ai_summary": "...",
        "top_posts": [{{"title": "...", "snippet": "...", "url": "..."}}]
    }}
    """
    return run_agent(url, goal, "Reddit")


# ── LeetCode Discuss ──────────────────────────────────────────────────────────
def scrape_leetcode(config):
    company = config['company'].lower().replace(" ", "-")
    url = f"https://leetcode.com/discuss/interview-experience/?currentPage=1&orderBy=hot&query={config['company']}+{config['role']}"
    goal = f"""
    On this LeetCode Discuss page for {config['company']} {config['role']} interviews:
    1. Extract the top 5 interview experience posts visible on the page
    2. For each post get the title, short description/snippet, and url
    Do NOT click into any posts or navigate away from this page.
    Return as JSON:
    {{
        "company": "{config['company']}",
        "role": "{config['role']}",
        "round_type": "{config['round_type']}",
        "source": "leetcode_discuss",
        "top_posts": [{{"title": "...", "snippet": "...", "url": "..."}}]
    }}
    """
    return run_agent(url, goal, "LeetCode Discuss")


# ── IGotAnOffer ───────────────────────────────────────────────────────────────
def scrape_igotanoffer(config):
    company = config['company'].lower().replace(" ", "-")
    role_slug = config['role'].lower().replace(" ", "-")
    url = f"https://igotanoffer.com/blogs/tech/{company}-{role_slug}-interview"
    goal = f"""
    On this IGotAnOffer page about {config['company']} {config['role']} interviews:
    1. Extract the main interview process overview
    2. Extract any specific interview questions mentioned
    3. Extract any tips or preparation advice
    Do NOT navigate away from this page.
    Return as JSON:
    {{
        "company": "{config['company']}",
        "role": "{config['role']}",
        "round_type": "{config['round_type']}",
        "source": "igotanoffer",
        "interview_overview": "...",
        "questions": ["question1", "question2"],
        "tips": ["tip1", "tip2"]
    }}
    """
    return run_agent(url, goal, "IGotAnOffer")


# ── GeeksForGeeks ─────────────────────────────────────────────────────────────
def scrape_gfg(config):
    q = f"{config['company']}+{config['role']}+interview+experience".replace(" ", "+")
    url = f"https://www.geeksforgeeks.org/search/?q={q}"
    goal = f"""
    On this GeeksForGeeks search page for {config['company']} {config['role']} interview experiences:
    1. Extract the top 5 interview experience articles visible on the page
    2. For each get the title, snippet, and url
    Do NOT click into any articles or navigate away from this page.
    Return as JSON:
    {{
        "company": "{config['company']}",
        "role": "{config['role']}",
        "round_type": "{config['round_type']}",
        "source": "geeksforgeeks",
        "top_posts": [{{"title": "...", "snippet": "...", "url": "..."}}]
    }}
    """
    return run_agent(url, goal, "GeeksForGeeks")


# ── Glassdoor ─────────────────────────────────────────────────────────────────
def scrape_glassdoor(config):
    company = config['company'].lower().replace(" ", "-")
    role = config['role'].lower().replace(" ", "-")
    url = f"https://www.glassdoor.com/Interview/{company}-{role}-interview-questions-SRCH_KE0,{len(company)}_KO{len(company)+1},{len(company)+1+len(role)}.htm"
    goal = f"""
    On this Glassdoor page for {config['company']} {config['role']} interview questions:
    1. Extract the top 5 interview questions visible on the page
    2. Extract any interview experience snippets or tips visible
    Do NOT log in or navigate away from this page.
    Return as JSON:
    {{
        "company": "{config['company']}",
        "role": "{config['role']}",
        "round_type": "{config['round_type']}",
        "source": "glassdoor",
        "questions": ["question1", "question2"],
        "experiences": [{{"snippet": "...", "rating": "..."}}]
    }}
    """
    return run_agent(url, goal, "Glassdoor")


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    scrapers = [
        (scrape_reddit,      "reddit_data.json"),
        (scrape_leetcode,    "leetcode_data.json"),
        (scrape_igotanoffer, "igotanoffer_data.json"),
        (scrape_gfg,         "gfg_data.json"),
        (scrape_glassdoor,   "glassdoor_data.json"),
    ]

    all_results = []

    for scraper_fn, filename in scrapers:
        try:
            data = scraper_fn(config)
            save_results(data, filename)
            all_results.append(data)
        except Exception as e:
            print(f"Error in {filename}: {e}")

    # Save combined output for teammate's Pinecone ingestion
    save_results(all_results, "all_data.json")
    print("\n All done! Combined data saved to output/all_data.json")