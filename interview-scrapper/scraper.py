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



# ── Build search query from config ───────────────────────────────────────────
def build_query(config):
    parts = [
        config["company"],
        config["role"],
        config["round_type"],
        "interview experience"
    ]
    if config.get("job_description"):
        parts.append(config["job_description"][:100])
    return " ".join(parts)


# ── Fetch run result directly from TinyFish API ───────────────────────────────
def fetch_run_result(run_id):
    resp = httpx.get(
        f"https://agent.tinyfish.ai/v1/runs/{run_id}",
        headers={"X-API-Key": os.getenv("TINYFISH_API_KEY")}
    )
    return resp.json()


# ── Scrape Reddit AI Summary ──────────────────────────────────────────────────
def scrape_reddit(config):
    query = build_query(config)
    url = f"https://www.reddit.com/search/?q={query.replace(' ', '+')}&sort=relevance&t=year"

    print(f"\nScraping Reddit...")
    print(f"   URL: {url}")

    results = {}

    with client.agent.stream(
        url=url,
        goal=f"""
        On this Reddit search page for {config['company']} {config['role']} {config['round_type']} interviews:

        1. Find and extract the AI-generated summary at the top of the search results
        2. Also extract the top 3-5 post titles and their short descriptions visible on the page
        
        Do NOT click into any posts or navigate away from this page.

        Return as JSON with keys:
        - company: "{config['company']}"
        - role: "{config['role']}"
        - round_type: "{config['round_type']}"
        - ai_summary: the full Reddit AI summary text
        - top_posts: array of objects with title, snippet, url
        - source: "reddit"
        """
    ) as stream:
        for event in stream:
            print(f"   Event: {event.type}")
            if event.type == "COMPLETE":
                run_data = fetch_run_result(event.run_id)

                results = run_data.get("result", {})
                break

    return results


# ── Save to JSON ──────────────────────────────────────────────────────────────
def save_results(data, filename):
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved to {filepath}")


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    reddit_data = scrape_reddit(config)
    save_results(reddit_data, "reddit_data.json")
    print("\n Result:")
    print(json.dumps(reddit_data, indent=2))