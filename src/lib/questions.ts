// ============================================================
// DEFAULT QUESTION BANK — universal behavioral + technical
// ============================================================

export interface Question {
  id: string;
  text: string;
  type: "behavioral" | "technical" | "system_design";
  category: string;
  hint: string;
  targetsWeakness: string[];
  difficulty: "easy" | "medium" | "hard";
}

export const QUESTION_BANK: Question[] = [
  {
    id: "b1",
    text: "Tell me about a time you had to design a system under tight performance constraints.",
    type: "behavioral",
    category: "Performance",
    hint: "Set specific context (team size, timeline, constraints). Describe YOUR actions with technical specifics. Quantify the before/after.",
    targetsWeakness: ["result_quantification", "technical_depth", "action_specificity"],
    difficulty: "medium",
  },
  {
    id: "b2",
    text: "Describe a situation where you significantly reduced costs or improved efficiency.",
    type: "behavioral",
    category: "Impact",
    hint: "Lead with the problem's cost/scale. Walk through your analysis and solution. End with specific $ or % impact.",
    targetsWeakness: ["result_quantification", "data_driven", "ownership"],
    difficulty: "medium",
  },
  {
    id: "b3",
    text: "Tell me about a time you built something that dramatically improved the user experience.",
    type: "behavioral",
    category: "Customer Focus",
    hint: "Define who the user was. What was their pain? What did you build? How did you measure success?",
    targetsWeakness: ["situation_context", "customer_focus", "result_quantification"],
    difficulty: "medium",
  },
  {
    id: "b4",
    text: "Give me an example of when you had to make a difficult technical decision with incomplete information.",
    type: "behavioral",
    category: "Decision Making",
    hint: "What was unknown? What options did you consider? How did you de-risk? What was the outcome?",
    targetsWeakness: ["trade_offs", "technical_depth", "bias_for_action"],
    difficulty: "hard",
  },
  {
    id: "b5",
    text: "Tell me about a time you had to influence or lead without formal authority.",
    type: "behavioral",
    category: "Leadership",
    hint: "Who did you need to influence? What was at stake? What approach did you take? What changed?",
    targetsWeakness: ["leadership_signals", "communication_clarity", "ownership"],
    difficulty: "hard",
  },
  {
    id: "b6",
    text: "Tell me about a time you failed or made a significant mistake. What did you learn?",
    type: "behavioral",
    category: "Growth",
    hint: "Be authentic and specific. Own it. Focus on what you did differently after. Show growth.",
    targetsWeakness: ["ownership", "action_specificity", "result_quantification"],
    difficulty: "medium",
  },
  {
    id: "b7",
    text: "Describe a project where you had to learn a new technology quickly to deliver results.",
    type: "behavioral",
    category: "Learning Agility",
    hint: "What was the technology? Why was it needed? How did you ramp up? What did you deliver?",
    targetsWeakness: ["action_specificity", "technical_depth", "bias_for_action"],
    difficulty: "medium",
  },
  {
    id: "b8",
    text: "Tell me about a time you disagreed with a teammate or manager. How did you handle it?",
    type: "behavioral",
    category: "Conflict",
    hint: "What was the disagreement about? How did you communicate your position? What was the resolution?",
    targetsWeakness: ["communication_clarity", "leadership_signals", "ownership"],
    difficulty: "medium",
  },
  {
    id: "b9",
    text: "Describe a time when you had to balance multiple competing priorities.",
    type: "behavioral",
    category: "Prioritization",
    hint: "What were the priorities? How did you decide? What tradeoffs did you make? What was the outcome?",
    targetsWeakness: ["task_clarity", "trade_offs", "data_driven"],
    difficulty: "easy",
  },
  {
    id: "b10",
    text: "Give an example of when you used data to drive a decision.",
    type: "behavioral",
    category: "Data-Driven",
    hint: "What data did you gather? How did you analyze it? What decision did it drive? What was the impact?",
    targetsWeakness: ["data_driven", "result_quantification", "technical_depth"],
    difficulty: "easy",
  },
  // === TECHNICAL ===
  {
    id: "t1",
    text: "How would you design a rate limiter for a high-throughput API system?",
    type: "technical",
    category: "System Design",
    hint: "Consider: token bucket vs sliding window, distributed vs local, Redis for shared state, graceful degradation.",
    targetsWeakness: ["system_design", "technical_depth", "trade_offs"],
    difficulty: "hard",
  },
  {
    id: "t2",
    text: "Explain how you'd handle a situation where a third-party API you depend on becomes unreliable.",
    type: "technical",
    category: "Reliability",
    hint: "Circuit breaker, bulkhead, fallback flows, retry with backoff, monitoring/alerting.",
    targetsWeakness: ["technical_depth", "system_design", "trade_offs"],
    difficulty: "medium",
  },
  {
    id: "t3",
    text: "Walk me through how you'd build a real-time notification system at scale.",
    type: "system_design",
    category: "System Design",
    hint: "Consider: push vs pull, WebSocket vs SSE vs polling, fanout strategies, delivery guarantees, mobile vs web.",
    targetsWeakness: ["system_design", "technical_depth", "communication_clarity"],
    difficulty: "hard",
  },
  {
    id: "t4",
    text: "How would you debug a production issue where API latency suddenly increased by 10x?",
    type: "technical",
    category: "Debugging",
    hint: "Systematic approach: check metrics, identify correlation, recent deploys, resource utilization, database queries, external dependencies.",
    targetsWeakness: ["technical_depth", "action_specificity", "communication_clarity"],
    difficulty: "medium",
  },
  {
    id: "t5",
    text: "Design a URL shortening service like bit.ly. What are the key considerations?",
    type: "system_design",
    category: "System Design",
    hint: "ID generation, base62 encoding, read-heavy optimization, caching, analytics, redirect latency.",
    targetsWeakness: ["system_design", "trade_offs", "technical_depth"],
    difficulty: "medium",
  },
];

export const WEAK_AREA_LABELS: Record<string, string> = {
  situation_context: "Setting Context",
  task_clarity: "Task Clarity",
  action_specificity: "Action Specificity",
  result_quantification: "Quantifying Results",
  technical_depth: "Technical Depth",
  system_design: "System Design",
  trade_offs: "Trade-off Analysis",
  communication_clarity: "Communication",
  conciseness: "Conciseness",
  confidence: "Confidence",
  leadership_signals: "Leadership",
  customer_focus: "Customer Focus",
  data_driven: "Data-Driven",
  ownership: "Ownership",
  bias_for_action: "Bias for Action",
};
