# Ethical Considerations

## Overview

CareerHub AI assists students with job applications using AI. This document outlines how we address potential harms and ensure the tool empowers people responsibly.

## 1. Truthfulness & Anti-Fabrication

**Risk**: AI could generate fake experience, inflated metrics, or fabricated projects on resumes.

**Mitigation**:
- Every resume generation prompt includes: *"ONLY use projects, experience, skills, and achievements from the ACTUAL RESUME above. NEVER fabricate or invent new projects, positions, or metrics — this is fraud."*
- The ATS Audit cross-checks generated resume content against the user's stated experience
- Generated content is always editable — users review and take responsibility for what they submit
- The system uses a "vault" model: all resume data comes from the user's own input, never from AI imagination

## 2. Privacy by Design

**Risk**: Sensitive personal data (resume, career goals, salary expectations) could be stored or leaked.

**Mitigation**:
- All personal data is stored exclusively in the user's browser (`localStorage`)
- No central database of student resumes or profiles
- The AI proxy is stateless — it forwards prompts and returns responses without logging
- No analytics or tracking beyond what the user sees
- Users can clear all data at any time by clearing browser storage

## 3. Equity & Access

**Risk**: Career tools typically benefit students at elite schools with existing career center resources.

**Mitigation**:
- The platform is free and open-source (MIT license)
- No premium tiers or paywalled features
- Works on any modern browser — no app download required
- Single HTML file deployment — any career center can host it
- Designed for students across all backgrounds, not just CS/engineering

## 4. Transparency

**Risk**: Users might not know when content is AI-generated.

**Mitigation**:
- AI-generated job descriptions are tagged with a visible "AI-Generated" badge
- Original JDs from job postings are labeled "Original JD"
- Resume and cover letter outputs are always presented in editable text areas
- The AI chat panel is clearly identified as an AI assistant, not a human counselor

## 5. Bias Awareness

**Risk**: AI scoring could encode biases against certain demographics.

**Mitigation**:
- Job scoring is based on **skill match** (technical overlap between JD requirements and user's stated skills), not demographics
- Visa status is handled as an eligibility factor (work authorization), not a preference or bias factor — the system flags only hard blockers like "US citizen required" or "security clearance"
- No scoring penalty for gaps in employment, non-traditional backgrounds, or school prestige
- The scoring rubric is transparent and visible to the user

## 6. Human Agency

**Risk**: Over-reliance on AI for career decisions.

**Mitigation**:
- Every generated document is presented as a **draft** for the user to edit
- The AI advisor provides analysis, not directives — recommendations include "APPLY", "MAYBE", or "SKIP" with reasoning, but the user decides
- Interview prep generates questions to practice, not scripts to memorize
- The tool explicitly does NOT auto-apply to jobs or send messages without user action

## 7. Potential Harms & Limitations

We acknowledge these limitations:
- **AI hallucination**: Despite anti-fabrication prompts, AI may occasionally generate plausible but inaccurate company details in cover letters. Users must verify.
- **Score accuracy**: The 0-100 match score is an estimate, not a guarantee. A high score doesn't mean you'll get the job; a low score doesn't mean you shouldn't apply.
- **Not a replacement for human advice**: For complex career decisions (visa strategy, salary negotiation, career pivots), professional human counselors provide irreplaceable value.
- **Data freshness**: Job listings and company information may be outdated by the time the user applies.

## 8. Responsible AI Usage

This project uses Claude (Anthropic) as its AI backbone. We follow Anthropic's usage policies:
- No use of AI to deceive employers about candidate qualifications
- No automated mass-application without human review
- No scraping or data collection beyond publicly available job listings
- All AI-generated content is reviewed by the human user before submission
