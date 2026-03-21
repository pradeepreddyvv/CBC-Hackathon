import asyncio, sqlite3, re, json, os, httpx
from datetime import datetime, timezone
from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

DB_PATH = os.environ.get("JD_SERVICE_DB_PATH", "/opt/jd_service/jobs.db")
GEMINI_KEY = os.environ.get("GEMINI_KEY", "")
GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'

# ── DB ───────────────────────────────────────────────────────────────────────
def get_db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = get_db()
    con.execute('''CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY, url TEXT, title TEXT, company TEXT,
        location TEXT, jd_text TEXT, source TEXT, scraped_at TEXT)''')
    con.execute('CREATE INDEX IF NOT EXISTS idx_url ON jobs(url)')
    con.commit(); con.close()

def db_get(job_id):
    con = get_db()
    row = con.execute('SELECT * FROM jobs WHERE job_id=?', (job_id,)).fetchone()
    con.close()
    return dict(row) if row else None

def db_upsert(job_id, url, title, company, location, jd_text, source):
    con = get_db()
    con.execute('INSERT OR REPLACE INTO jobs VALUES(?,?,?,?,?,?,?,?)',
        (job_id, url, title, company, location, jd_text, source,
         datetime.now(timezone.utc).isoformat()))
    con.commit(); con.close()

def db_count():
    con = get_db()
    n = con.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]
    con.close(); return n

def db_all():
    con = get_db()
    rows = con.execute('SELECT job_id,url,title,company,location,LENGTH(jd_text) as jd_len,source,scraped_at FROM jobs ORDER BY scraped_at DESC').fetchall()
    con.close()
    return [dict(r) for r in rows]

# ── ATS JSON APIs ─────────────────────────────────────────────────────────────
async def try_greenhouse(url):
    m = re.search(r'boards\.greenhouse\.io/([^/?#]+)/jobs/(\d+)', url)
    if not m: return None
    co, jid = m.group(1), m.group(2)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f'https://boards.greenhouse.io/{co}/jobs/{jid}.json',
                            headers={'User-Agent':'Mozilla/5.0'})
            if r.status_code != 200: return None
            d = r.json()
            jd = re.sub(r'<[^>]+>', ' ', d.get('content',''))
            jd = re.sub(r'\s+', ' ', jd).strip()
            return {'title':d.get('title',''),'company':co,'jd':jd,'source':'greenhouse-api'} if len(jd)>100 else None
    except: return None

async def try_lever(url):
    m = re.search(r'jobs\.lever\.co/([^/?#]+)/([a-f0-9\-]+)', url)
    if not m: return None
    co, jid = m.group(1), m.group(2)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f'https://api.lever.co/v0/postings/{co}/{jid}',
                            headers={'User-Agent':'Mozilla/5.0'})
            if r.status_code != 200: return None
            d = r.json()
            jd = d.get('descriptionPlain','') + '\n' + '\n'.join(
                l.get('text','') + '\n' + '\n'.join(i.get('text','') for i in l.get('content',[]))
                for l in d.get('lists',[]))
            return {'title':d.get('text',''),'company':co,'jd':jd.strip(),'source':'lever-api'} if len(jd.strip())>100 else None
    except: return None

async def try_ashby(url):
    m = re.search(r'jobs\.ashbyhq\.com/([^/?#]+)/([a-f0-9\-]+)', url)
    if not m: return None
    co, jid = m.group(1), m.group(2)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post('https://jobs.ashbyhq.com/api/non-user-graphql',
                headers={'User-Agent':'Mozilla/5.0','Content-Type':'application/json'},
                json={'operationName':'ApiJobPosting',
                      'variables':{'jobPostingId': jid, 'organizationHostedJobsPageName': co},
                      'query':'query ApiJobPosting($jobPostingId: String!, $organizationHostedJobsPageName: String!) { jobPosting(jobPostingId: $jobPostingId, organizationHostedJobsPageName: $organizationHostedJobsPageName) { title descriptionHtml } }'})
            if r.status_code != 200: return None
            d = (r.json().get('data') or {}).get('jobPosting') or {}
            jd = re.sub(r'<[^>]+>', ' ', d.get('descriptionHtml',''))
            jd = re.sub(r'\s+', ' ', jd).strip()
            co_name = co
            return {'title':d.get('title',''),'company':co_name,'jd':jd,'source':'ashby-api'} if len(jd)>100 else None
    except: return None

# ── crawl4ai + Gemini ─────────────────────────────────────────────────────────
async def try_crawl4ai(url):
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
        bcfg = BrowserConfig(headless=True, browser_type='chromium',
                              extra_args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        # Wait for JS-rendered content: wait for network idle + explicit delay
        js_wait = 'new Promise(r => setTimeout(r, 3000))'
        rcfg = CrawlerRunConfig(
            word_count_threshold=20,
            remove_overlay_elements=True,
            page_timeout=30000,
            js_code=js_wait,
        )
        async with AsyncWebCrawler(config=bcfg) as crawler:
            res = await crawler.arun(url=url, config=rcfg)
            text = (getattr(res, 'markdown', '') or
                    getattr(res, 'fit_markdown', '') or
                    getattr(res, 'cleaned_html', '') or '')
            if isinstance(text, object) and hasattr(text, 'raw_markdown'):
                text = text.raw_markdown or ''
            return str(text)[:8000] if len(str(text)) > 150 else None
    except Exception as e:
        print(f'crawl4ai error: {e}')
        return None

async def gemini_extract(text, url, title, company):
    prompt = f'Extract the complete job description from this page content. Return well-formatted plain text including: role overview, what you will do (bullet points), requirements, nice-to-haves. Be thorough.\n\nCompany: {company}\nRole: {title}\nURL: {url}\n\nCONTENT:\n{text[:7000]}'
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f'{GEMINI_URL}?key={GEMINI_KEY}',
                json={'contents':[{'role':'user','parts':[{'text':prompt}]}],
                      'generationConfig':{'maxOutputTokens':2048,'temperature':0.1}})
            if r.status_code == 200:
                return (r.json().get('candidates',[{}])[0].get('content',{})
                          .get('parts',[{}])[0].get('text',''))
            else:
                print(f'Gemini error {r.status_code}: {r.text[:200]}')
    except Exception as e:
        print(f'Gemini exception: {e}')
    return ''

# ── Master scrape ─────────────────────────────────────────────────────────────
async def scrape_job(url, title='', company='', location='', job_id=''):
    for fn in [try_greenhouse, try_lever, try_ashby]:
        try:
            res = await fn(url)
            if res and len(res.get('jd','')) > 100:
                return {'jd':res['jd'],'title':res.get('title',title),
                        'company':res.get('company',company),'source':res['source']}
        except: pass

    text = await try_crawl4ai(url)
    if text:
        jd = await gemini_extract(text, url, title, company)
        if len(jd) > 100:
            return {'jd':jd,'title':title,'company':company,'source':'crawl4ai+gemini'}

    return {'jd':'','title':title,'company':company,'source':'failed'}

# ── FastAPI ────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

@app.get('/health')
def health():
    return {'ok':True,'jobs_in_db':db_count()}

@app.get('/scrape')
async def scrape_endpoint(
    url: str=Query(...), job_id: str=Query(default=''),
    title: str=Query(default=''), company: str=Query(default=''),
    location: str=Query(default=''), force: bool=Query(default=False)
):
    key = job_id or url
    if not force:
        cached = db_get(key)
        if cached and len(cached.get('jd_text','')) > 100:
            return {'jd':cached['jd_text'],'title':cached['title'],'company':cached['company'],
                    'source':cached['source'],'cached':True,'job_id':key,'ok':True}
    res = await scrape_job(url, title, company, location, key)
    if len(res.get('jd','')) > 100:
        db_upsert(key, url, res['title'], res['company'], location, res['jd'], res['source'])
    return {'jd':res['jd'],'title':res['title'],'company':res['company'],'source':res['source'],
            'cached':False,'job_id':key,'ok':len(res.get('jd',''))>100}

@app.post('/batch')
async def batch(background_tasks: BackgroundTasks, payload: dict):
    jobs = payload.get('jobs', [])
    async def run():
        done = 0
        for j in jobs:
            try:
                key = str(j.get('job_id') or j.get('id') or j.get('url',''))
                if not key: continue
                # Save pre-existing descriptions directly
                existing_jd = (j.get('description') or '').strip()
                if len(existing_jd) > 100:
                    if not db_get(key):
                        db_upsert(key, j.get('link') or j.get('url',''), j.get('title',''),
                                  j.get('company',''), j.get('location',''), existing_jd,
                                  j.get('source','api'))
                        done += 1
                    continue
                cached = db_get(key)
                if cached and len(cached.get('jd_text','')) > 100: continue
                url = j.get('link') or j.get('url','')
                if not url or 'linkedin.com' in url: continue  # skip LinkedIn (auth required)
                res = await scrape_job(url, j.get('title',''), j.get('company',''),
                                       j.get('location',''), key)
                if len(res.get('jd','')) > 100:
                    db_upsert(key, url, res.get('title',j.get('title','')),
                              res.get('company',j.get('company','')),
                              j.get('location',''), res['jd'], res['source'])
                    done += 1
                    print(f'[+] {j.get("title","?")[:40]} @ {j.get("company","?")[:20]} [{res["source"]}]')
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f'Batch error {j.get("id","?")}: {e}')
        print(f'Batch done. Saved {done} jobs.')
    background_tasks.add_task(run)
    return {'ok':True,'queued':len(jobs),'message':'Batch scraping started'}

@app.get('/jobs')
def list_jobs():
    return {'jobs':db_all(),'count':db_count()}

@app.get('/jobs/{job_id:path}')
def get_job(job_id: str):
    row = db_get(job_id)
    return row if row else JSONResponse({'error':'not found'},status_code=404)

@app.delete('/jobs/{job_id:path}')
def delete_job(job_id: str):
    con = get_db(); con.execute('DELETE FROM jobs WHERE job_id=?',(job_id,)); con.commit(); con.close()
    return {'ok':True}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('service:app', host='0.0.0.0', port=8765, log_level='info', reload=False)
