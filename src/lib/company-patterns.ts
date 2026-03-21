// ============================================================
// COMPANY-SPECIFIC INTERVIEW PATTERNS — RAG-lite
// Built-in knowledge of how each company interviews
// ============================================================

export interface CompanyPattern {
  name: string;
  interviewStyle: string;
  keyPrinciples: string[];
  questionTypes: string[];
  whatTheyLookFor: string[];
  commonPitfalls: string[];
  tips: string[];
  behavioralWeight: number; // 0-100
  technicalWeight: number;
  systemDesignWeight: number;
}

export const COMPANY_PATTERNS: Record<string, CompanyPattern> = {
  Amazon: {
    name: "Amazon",
    interviewStyle: "Leadership Principles (LP) driven. Every behavioral answer must map to a specific LP. Bar Raiser interview is unique — an independent evaluator from another team.",
    keyPrinciples: [
      "Customer Obsession — Start with the customer and work backwards",
      "Ownership — Think long term, act on behalf of the entire company",
      "Invent and Simplify — Expect innovation from your team",
      "Are Right, A Lot — Strong judgment and good instincts",
      "Learn and Be Curious — Never stop learning",
      "Hire and Develop the Best — Raise the performance bar",
      "Insist on the Highest Standards — Continuously raise the bar",
      "Think Big — Create and communicate a bold direction",
      "Bias for Action — Speed matters, calculated risk-taking",
      "Frugality — Accomplish more with less",
      "Earn Trust — Listen attentively, speak candidly, treat others respectfully",
      "Dive Deep — Stay connected to the details, audit frequently",
      "Have Backbone; Disagree and Commit — Challenge decisions respectfully",
      "Deliver Results — Focus on key inputs, deliver with the right quality",
    ],
    questionTypes: ["behavioral (LP-mapped)", "system design", "coding", "bar raiser behavioral"],
    whatTheyLookFor: ["data-driven decisions", "customer impact", "ownership language", "specific metrics", "learning from failure"],
    commonPitfalls: ["saying 'we' instead of 'I'", "no metrics in results", "not mapping to an LP", "being vague about your specific contribution"],
    tips: ["Prepare 2 stories per LP", "Always quantify results", "Use 'I' not 'we'", "Show leadership even in IC roles", "Mention customer impact"],
    behavioralWeight: 50,
    technicalWeight: 30,
    systemDesignWeight: 20,
  },
  Google: {
    name: "Google",
    interviewStyle: "Structured interviews with clear rubrics. Focus on 'Googliness' (cultural fit), cognitive ability, role-related knowledge, and leadership. Committee-based hiring — your interviewer doesn't make the decision alone.",
    keyPrinciples: [
      "Googliness — Comfortable with ambiguity, collaborative, humble",
      "General Cognitive Ability — Problem-solving, learning ability",
      "Role-Related Knowledge — Technical depth for the role",
      "Leadership — Emergent leadership, influence without authority",
    ],
    questionTypes: ["coding (Leetcode medium-hard)", "system design", "behavioral (Googliness)", "role-specific technical"],
    whatTheyLookFor: ["handling ambiguity", "collaborative problem-solving", "intellectual humility", "scalable thinking", "asking good clarifying questions"],
    commonPitfalls: ["jumping to solution without clarifying", "not considering edge cases", "overconfidence", "not showing collaborative mindset"],
    tips: ["Think out loud", "Ask clarifying questions first", "Discuss trade-offs explicitly", "Show you can handle ambiguity", "Be humble about what you don't know"],
    behavioralWeight: 30,
    technicalWeight: 45,
    systemDesignWeight: 25,
  },
  Meta: {
    name: "Meta",
    interviewStyle: "Move fast and ship. Values impact, scale thinking, and builder mentality. 'Why Meta' question is important. Strong focus on coding speed and system design at scale.",
    keyPrinciples: [
      "Move Fast — Ship quickly, iterate, don't overthink",
      "Be Bold — Take risks, think at massive scale",
      "Focus on Impact — Prioritize what matters most",
      "Be Open — Transparent communication, feedback culture",
      "Build Social Value — Connect people, build community",
    ],
    questionTypes: ["coding (2 rounds, 45min each)", "system design (focus on scale)", "behavioral (impact-driven)"],
    whatTheyLookFor: ["shipping speed", "impact quantification", "scale thinking (billions of users)", "strong coding fundamentals", "builder mindset"],
    commonPitfalls: ["over-engineering", "not thinking about scale", "slow problem-solving", "no clear impact metrics"],
    tips: ["Practice coding speed", "Think in terms of billions of users", "Show you ship fast and iterate", "Quantify impact in every story", "Show builder mentality"],
    behavioralWeight: 25,
    technicalWeight: 50,
    systemDesignWeight: 25,
  },
  Microsoft: {
    name: "Microsoft",
    interviewStyle: "Growth mindset culture. Values collaboration, customer empathy, and inclusivity. 'As-appropriate' (AA) interview with a senior leader. More conversational than other FAANG.",
    keyPrinciples: [
      "Growth Mindset — Learn from failure, embrace challenges",
      "Customer Obsession — Deeply understand customer needs",
      "Diversity and Inclusion — Create for everyone",
      "One Microsoft — Collaborate across teams",
      "Making a Difference — Impact that matters",
    ],
    questionTypes: ["coding", "system design", "behavioral (growth mindset)", "AA interview (senior leader)"],
    whatTheyLookFor: ["growth mindset examples", "collaboration stories", "learning from failure", "customer empathy", "inclusive thinking"],
    commonPitfalls: ["being too competitive/individualistic", "not showing learning", "ignoring accessibility", "not asking about customer needs"],
    tips: ["Show genuine curiosity and learning", "Talk about collaboration wins", "Mention accessibility and inclusive design", "Be authentic about failures and growth", "Ask thoughtful questions about the team"],
    behavioralWeight: 35,
    technicalWeight: 40,
    systemDesignWeight: 25,
  },
  Apple: {
    name: "Apple",
    interviewStyle: "Secretive and detail-oriented. Focus on craftsmanship, attention to detail, and passion for the product. Cross-functional collaboration is key. Expect 'why Apple' and product sense questions.",
    keyPrinciples: [
      "Attention to Detail — Sweat the small stuff",
      "Simplicity — Make complex things simple",
      "Innovation — Think different",
      "Craftsmanship — Build beautiful, polished products",
      "Cross-Functional — Work across disciplines",
    ],
    questionTypes: ["coding", "system design", "behavioral", "product sense", "cross-functional scenarios"],
    whatTheyLookFor: ["passion for Apple products", "attention to detail", "cross-functional collaboration", "craftsmanship mindset", "simplicity in design"],
    commonPitfalls: ["not knowing Apple products", "sloppy solutions", "not considering user experience", "being siloed in thinking"],
    tips: ["Use Apple products and have opinions", "Show attention to detail in your code", "Talk about user experience", "Show cross-functional thinking", "Be passionate but genuine"],
    behavioralWeight: 30,
    technicalWeight: 40,
    systemDesignWeight: 30,
  },
  Netflix: {
    name: "Netflix",
    interviewStyle: "Culture deck driven. Values freedom and responsibility, context not control, highly aligned loosely coupled teams. Expect deep culture fit questions.",
    keyPrinciples: [
      "Freedom and Responsibility — High performance with autonomy",
      "Context, Not Control — Provide context, trust judgment",
      "Highly Aligned, Loosely Coupled — Agree on strategy, independent execution",
      "Pay Top of Market — Attract and retain the best",
      "Keeper Test — Would your manager fight to keep you?",
    ],
    questionTypes: ["coding", "system design (streaming scale)", "behavioral (culture fit)", "values alignment"],
    whatTheyLookFor: ["independent judgment", "candid communication", "high performance mindset", "comfort with ambiguity", "strong opinions loosely held"],
    commonPitfalls: ["needing too much guidance", "avoiding conflict", "not being candid", "playing it safe"],
    tips: ["Read the Netflix culture deck", "Show independent decision-making", "Be candid and direct", "Demonstrate strong opinions with evidence", "Show you thrive with autonomy"],
    behavioralWeight: 40,
    technicalWeight: 35,
    systemDesignWeight: 25,
  },
  Startup: {
    name: "Startup",
    interviewStyle: "Wear many hats. Values ownership, shipping speed, and resourcefulness. Often less structured — founder/CTO interviews. Focus on what you've built end-to-end.",
    keyPrinciples: [
      "Ownership — Own problems end-to-end",
      "Ship Fast — Bias for action over perfection",
      "Resourcefulness — Do more with less",
      "Adaptability — Wear many hats",
      "Impact — Every person's contribution matters",
    ],
    questionTypes: ["take-home project", "pair programming", "system design", "behavioral (ownership)", "culture fit with founders"],
    whatTheyLookFor: ["full-stack capability", "shipping real products", "comfort with ambiguity", "self-direction", "passion for the problem"],
    commonPitfalls: ["over-engineering", "needing too much structure", "only knowing one area", "not showing enthusiasm for the mission"],
    tips: ["Show projects you built end-to-end", "Demonstrate you can wear multiple hats", "Be scrappy — show resourcefulness", "Show passion for the startup's problem", "Talk about shipping, not just building"],
    behavioralWeight: 30,
    technicalWeight: 40,
    systemDesignWeight: 30,
  },
  General: {
    name: "General",
    interviewStyle: "Standard technical interview format. Behavioral (STAR method), coding (data structures & algorithms), system design for senior roles.",
    keyPrinciples: [
      "Clear Communication — Structure your answers",
      "Problem Solving — Show your thought process",
      "Technical Depth — Know your stack deeply",
      "Collaboration — Show teamwork and leadership",
      "Growth — Demonstrate learning and improvement",
    ],
    questionTypes: ["behavioral (STAR)", "coding", "system design", "technical deep-dive"],
    whatTheyLookFor: ["structured thinking", "clear communication", "technical competence", "teamwork", "growth mindset"],
    commonPitfalls: ["unstructured answers", "no metrics", "saying 'we' instead of 'I'", "not asking clarifying questions"],
    tips: ["Use STAR format consistently", "Quantify every result", "Practice coding on whiteboard/shared editor", "Prepare questions to ask the interviewer", "Research the company thoroughly"],
    behavioralWeight: 35,
    technicalWeight: 40,
    systemDesignWeight: 25,
  },
};

export function getCompanyPattern(company: string): CompanyPattern {
  return COMPANY_PATTERNS[company] || COMPANY_PATTERNS.General;
}

// Inject company context into prompts
export function getCompanyPromptContext(company: string): string {
  const p = getCompanyPattern(company);
  return `
COMPANY INTERVIEW INTELLIGENCE — ${p.name}:
Style: ${p.interviewStyle}
Key Principles: ${p.keyPrinciples.join("; ")}
They look for: ${p.whatTheyLookFor.join(", ")}
Common pitfalls: ${p.commonPitfalls.join(", ")}
Weight: ${p.behavioralWeight}% behavioral, ${p.technicalWeight}% technical, ${p.systemDesignWeight}% system design`;
}
